// src/controllers/attendance.js
//
// Thin HTTP adapters over the attendance services: parse/validate input,
// call a service, shape the { message, data, meta? } envelope.
import { asyncHandler } from "../middleware/error-handler.js";
import { HTTP_STATUS_CODES } from "../config/constants.js";
import { validationMiddleware } from "../validation/validation-error-handler.js";
import {
  attendanceStepValidation,
  createAttendanceValidation,
  createChallengeValidation,
  updateAttendanceValidation,
} from "../validation/attendance-validation.js";
import { parsePagination } from "../utils/pagination.js";
import { parseId } from "../utils/parse-id.js";
import { framesOrThrow, stepFramesOrThrow } from "../utils/liveness-frames.js";
import * as attendanceService from "../services/attendance.service.js";
import { assertAttendant } from "../utils/authorization.js";
import * as attendanceQueryService from "../services/attendance-query.service.js";
import { sendPage } from "./shared.js";

// Step 1: preflight (venue code + enrollment + window) + issue a randomized
// liveness challenge, for either check-in (mode "in") or check-out ("out").
const handleCreateChallenge = asyncHandler(async (req, res, _next) => {
  assertAttendant(req.user, "Only attendants can mark attendance.");
  const eventId = parseId(req.params.eventId, "Valid event ID is required.");
  const { venueCode, mode } = req.body;

  const challenge = await attendanceService.prepareAttendanceChallenge(
    parseInt(req.user.id),
    eventId,
    { venueCode, mode: mode === "out" ? "out" : "in" }
  );

  res.status(HTTP_STATUS_CODES.OK).json({
    message: "Liveness challenge issued. Follow the on-screen actions.",
    data: challenge,
  });
});

export const createAttendanceChallenge = [
  validationMiddleware.create(createChallengeValidation),
  handleCreateChallenge,
];

// Step 2, check-in: verify the uploaded frames server-side and record attendance.
const handleCreateAttendance = asyncHandler(async (req, res, _next) => {
  assertAttendant(req.user, "Only attendants can check in.");
  const eventId = parseId(req.params.eventId, "Valid event ID is required.");
  const frameBuffers = framesOrThrow(req.files);

  const attendance = await attendanceService.checkIn(
    parseInt(req.user.id),
    eventId,
    {
      challengeToken: req.body.challengeToken,
      venueCode: req.body.venueCode,
      frameBuffers,
      ip: req.ip,
    }
  );

  res.status(HTTP_STATUS_CODES.CREATED).json({
    message: `Attendance marked successfully as ${attendance.status}.`,
    data: attendance,
  });
});

export const createAttendance = [
  validationMiddleware.create(createAttendanceValidation),
  handleCreateAttendance,
];

// Step 2, check-out: same server-side liveness as check-in, over uploaded frames.
const handleUpdateAttendance = asyncHandler(async (req, res, _next) => {
  assertAttendant(req.user, "Only attendants can check out.");
  const eventId = parseId(req.params.eventId, "Valid event ID is required.");
  const frameBuffers = framesOrThrow(req.files);

  const attendance = await attendanceService.checkOut(
    parseInt(req.user.id),
    eventId,
    {
      challengeToken: req.body.challengeToken,
      venueCode: req.body.venueCode,
      frameBuffers,
      ip: req.ip,
    }
  );

  res.status(HTTP_STATUS_CODES.OK).json({
    message: "Successfully checked out of the session.",
    data: attendance,
  });
});

export const updateAttendance = [
  validationMiddleware.create(updateAttendanceValidation),
  handleUpdateAttendance,
];

// Step-by-step step 1: preflight + issue a step challenge (mode "in"/"out").
const handleCreateStepChallenge = asyncHandler(async (req, res, _next) => {
  assertAttendant(req.user, "Only attendants can mark attendance.");
  const eventId = parseId(req.params.eventId, "Valid event ID is required.");
  const { venueCode, mode } = req.body;

  const challenge = await attendanceService.prepareAttendanceStepChallenge(
    parseInt(req.user.id),
    eventId,
    { venueCode, mode: mode === "out" ? "out" : "in" }
  );

  res.status(HTTP_STATUS_CODES.OK).json({
    message: "Step-by-step scan started. Perform the first action.",
    data: challenge,
  });
});

export const createAttendanceStepChallenge = [
  validationMiddleware.create(createChallengeValidation),
  handleCreateStepChallenge,
];

// Step-by-step check-in: verify ONE action; advance or commit on the last step.
const handleStepCheckIn = asyncHandler(async (req, res, _next) => {
  assertAttendant(req.user, "Only attendants can check in.");
  const eventId = parseId(req.params.eventId, "Valid event ID is required.");
  const frameBuffers = stepFramesOrThrow(req.files);

  const result = await attendanceService.stepCheckIn(
    parseInt(req.user.id),
    eventId,
    {
      challengeToken: req.body.challengeToken,
      venueCode: req.body.venueCode,
      frameBuffers,
      ip: req.ip,
    }
  );

  res.status(result.done ? HTTP_STATUS_CODES.CREATED : HTTP_STATUS_CODES.OK).json({
    message: result.done
      ? `Attendance marked successfully as ${result.attendance.status}.`
      : "Action verified. Perform the next action.",
    data: result,
  });
});

export const stepCheckIn = [
  validationMiddleware.create(attendanceStepValidation),
  handleStepCheckIn,
];

// Step-by-step check-out: same, over the check-out challenge.
const handleStepCheckOut = asyncHandler(async (req, res, _next) => {
  assertAttendant(req.user, "Only attendants can check out.");
  const eventId = parseId(req.params.eventId, "Valid event ID is required.");
  const frameBuffers = stepFramesOrThrow(req.files);

  const result = await attendanceService.stepCheckOut(
    parseInt(req.user.id),
    eventId,
    {
      challengeToken: req.body.challengeToken,
      venueCode: req.body.venueCode,
      frameBuffers,
      ip: req.ip,
    }
  );

  res.status(HTTP_STATUS_CODES.OK).json({
    message: result.done
      ? "Successfully checked out of the session."
      : "Action verified. Perform the next action.",
    data: result,
  });
});

export const stepCheckOut = [
  validationMiddleware.create(attendanceStepValidation),
  handleStepCheckOut,
];

export const getUserAttendance = asyncHandler(async (req, res) => {
  const userId = parseId(req.params.userId, "Valid user ID is required.");
  const { page, limit, skip } = parsePagination(req.query);

  const { attendances, total } =
    await attendanceQueryService.listUserAttendance(req.user, userId, {
      skip,
      limit,
      search: req.query.search || "",
      status: req.query.status,
      eventType: req.query.eventType,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    });

  sendPage(res, {
    message: "User attendance successfully fetched.",
    emptyMessage: "No attendance records found for this user.",
    rows: attendances,
    total,
    page,
    limit,
  });
});

export const getEventAttendance = asyncHandler(async (req, res, _next) => {
  const eventId = parseId(req.params.eventId, "Valid event ID is required.");
  const { page, limit, skip } = parsePagination(req.query);

  const { attendances, total } =
    await attendanceQueryService.listEventAttendance(eventId, {
      skip,
      limit,
      search: req.query.search || "",
      status: req.query.status,
      sessionId: req.query.sessionId,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    });

  sendPage(res, {
    message: "Event attendance successfully fetched.",
    emptyMessage: "No attendance records found for this event.",
    rows: attendances,
    total,
    page,
    limit,
  });
});

export const getUserEventAttendance = asyncHandler(async (req, res, _next) => {
  const userId = parseId(req.params.userId, "Valid user ID is required.");
  const eventId = parseId(req.params.eventId, "Valid event ID is required.");
  const { page, limit, skip } = parsePagination(req.query);

  const { attendances, total } =
    await attendanceQueryService.listUserEventAttendance(
      req.user,
      userId,
      eventId,
      {
        skip,
        limit,
        status: req.query.status,
        sessionId: req.query.sessionId,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
      }
    );

  sendPage(res, {
    message: "User event attendance successfully fetched.",
    emptyMessage: "No attendance records found for this user and event.",
    rows: attendances,
    total,
    page,
    limit,
  });
});

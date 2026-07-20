// src/controllers/attendance.js
//
// Thin HTTP adapters over the attendance services: parse/validate input,
// call a service, shape the { message, data, meta? } envelope.
import {
  asyncHandler,
  ValidationError,
} from "../middleware/error-handler.js";
import { HTTP_STATUS_CODES } from "../config/constants.js";
import { validationMiddleware } from "../validation/validation-error-handler.js";
import {
  createAttendanceValidation,
  createChallengeValidation,
  updateAttendanceValidation,
} from "../validation/attendance-validation.js";
import { parsePagination, paginationMeta } from "../utils/pagination.js";
import * as attendanceService from "../services/attendance.service.js";
import { assertAttendant } from "../utils/authorization.js";
import * as attendanceQueryService from "../services/attendance-query.service.js";
import { LIVENESS } from "../config/constants.js";

const parseId = (value, message) => {
  if (!value || isNaN(parseInt(value))) {
    throw new ValidationError(message);
  }
  return parseInt(value);
};

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

/** Shared frame-count guard for the multipart capture uploads. */
const framesOrThrow = (req) => {
  const files = req.files ?? [];
  if (files.length < LIVENESS.MIN_FRAMES || files.length > LIVENESS.MAX_FRAMES) {
    throw new ValidationError(
      `Please capture between ${LIVENESS.MIN_FRAMES} and ${LIVENESS.MAX_FRAMES} frames.`
    );
  }
  return files.map((file) => file.buffer);
};

// Step 2, check-in: verify the uploaded frames server-side and record attendance.
const handleCreateAttendance = asyncHandler(async (req, res, _next) => {
  assertAttendant(req.user, "Only attendants can check in.");
  const eventId = parseId(req.params.eventId, "Valid event ID is required.");
  const frameBuffers = framesOrThrow(req);

  const attendance = await attendanceService.checkIn(
    parseInt(req.user.id),
    eventId,
    { challengeToken: req.body.challengeToken, frameBuffers, ip: req.ip }
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
  const frameBuffers = framesOrThrow(req);

  const attendance = await attendanceService.checkOut(
    parseInt(req.user.id),
    eventId,
    { challengeToken: req.body.challengeToken, frameBuffers, ip: req.ip }
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

  if (attendances.length === 0) {
    return res.status(HTTP_STATUS_CODES.OK).json({
      message: "No attendance records found for this user.",
      data: [],
      meta: paginationMeta(0, page, limit),
    });
  }

  res.status(HTTP_STATUS_CODES.OK).json({
    message: "User attendance successfully fetched.",
    data: attendances,
    meta: paginationMeta(total, page, limit),
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

  if (attendances.length === 0) {
    return res.status(HTTP_STATUS_CODES.OK).json({
      message: "No attendance records found for this event.",
      data: [],
      meta: paginationMeta(0, page, limit),
    });
  }

  res.status(HTTP_STATUS_CODES.OK).json({
    message: "Event attendance successfully fetched.",
    data: attendances,
    meta: paginationMeta(total, page, limit),
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

  if (attendances.length === 0) {
    return res.status(HTTP_STATUS_CODES.OK).json({
      message: "No attendance records found for this user and event.",
      data: [],
      meta: paginationMeta(0, page, limit),
    });
  }

  res.status(HTTP_STATUS_CODES.OK).json({
    message: "User event attendance successfully fetched.",
    data: attendances,
    meta: paginationMeta(total, page, limit),
  });
});

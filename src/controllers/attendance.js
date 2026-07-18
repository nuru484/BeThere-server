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
  updateAttendanceValidation,
} from "../validation/attendance-validation.js";
import { parsePagination, paginationMeta } from "../utils/pagination.js";
import * as attendanceService from "../services/attendance.service.js";
import * as attendanceQueryService from "../services/attendance-query.service.js";

const parseId = (value, message) => {
  if (!value || isNaN(parseInt(value))) {
    throw new ValidationError(message);
  }
  return parseInt(value);
};

const handleCreateAttendance = asyncHandler(async (req, res, _next) => {
  const eventId = parseId(req.params.eventId, "Valid event ID is required.");
  const { latitude, longitude, faceDescriptor } = req.body;

  const attendance = await attendanceService.checkIn(
    parseInt(req.user.id),
    eventId,
    { latitude, longitude, faceDescriptor }
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

const handleUpdateAttendance = asyncHandler(async (req, res, _next) => {
  const eventId = parseId(req.params.eventId, "Valid event ID is required.");
  const { latitude, longitude } = req.body;

  const attendance = await attendanceService.checkOut(
    parseInt(req.user.id),
    eventId,
    { latitude, longitude }
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

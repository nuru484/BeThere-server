// src/controllers/attendance-reports.js
//
// Thin HTTP adapter over the attendance report service.
import { asyncHandler } from "../middleware/error-handler.js";
import { HTTP_STATUS_CODES } from "../config/constants.js";
import { parsePagination, paginationMeta } from "../utils/pagination.js";
import * as attendanceReportService from "../services/attendance-report.service.js";

export const getAttendanceReports = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);

  const { items, total, topAttendees, summary } =
    await attendanceReportService.getAttendanceReports({
      skip,
      limit,
      search: req.query.search || "",
      userId: req.query.userId,
      eventName: req.query.eventName,
      locationName: req.query.locationName,
      status: req.query.status,
      isRecurring: req.query.isRecurring,
      eventType: req.query.eventType,
      checkInStartDate: req.query.checkInStartDate,
      checkInEndDate: req.query.checkInEndDate,
      sessionStartDate: req.query.sessionStartDate,
      sessionEndDate: req.query.sessionEndDate,
      city: req.query.city,
      country: req.query.country,
    });

  res.status(HTTP_STATUS_CODES.OK).json({
    message: "Attendance reports successfully fetched.",
    data: items,
    topAttendees,
    summary,
    meta: paginationMeta(total, page, limit),
  });
});

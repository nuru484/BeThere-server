// src/controllers/attendance-reports.js
//
// Thin HTTP adapter over the attendance report service.
import { asyncHandler } from "../middleware/error-handler.js";
import { HTTP_STATUS_CODES } from "../config/constants.js";
import { parsePagination, paginationMeta } from "../utils/pagination.js";
import * as attendanceReportService from "../services/attendance-report.service.js";
import { buildAttendanceReportXlsx } from "../services/attendance-report-export.service.js";

/** The (all optional) report filters, read from the query in one place. */
const reportFilters = (req) => ({
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

export const getAttendanceReports = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);

  const { items, total, topAttendees, summary } =
    await attendanceReportService.getAttendanceReports({
      skip,
      limit,
      ...reportFilters(req),
    });

  res.status(HTTP_STATUS_CODES.OK).json({
    message: "Attendance reports successfully fetched.",
    data: items,
    topAttendees,
    summary,
    meta: paginationMeta(total, page, limit),
  });
});

/** Streams the filtered report as an .xlsx download. */
export const exportAttendanceReport = asyncHandler(async (req, res) => {
  const { buffer, filename } = await buildAttendanceReportXlsx(reportFilters(req));

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.status(HTTP_STATUS_CODES.OK).send(buffer);
});

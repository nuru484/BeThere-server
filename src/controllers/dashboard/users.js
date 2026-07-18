// src/controllers/dashboard/users.js
//
// Thin HTTP adapters over the user dashboard service.
import { asyncHandler } from "../../middleware/error-handler.js";
import { HTTP_STATUS_CODES } from "../../config/constants.js";
import * as dashboardUserService from "../../services/dashboard-user.service.js";

export const getUserDashboardTotals = asyncHandler(async (req, res, _next) => {
  const data = await dashboardUserService.getUserDashboardTotals();

  res.status(HTTP_STATUS_CODES.OK).json({
    message: "Dashboard totals fetched successfully",
    data,
  });
});

export const getRecentEvents = asyncHandler(async (req, res, _next) => {
  const data = await dashboardUserService.getRecentEvents();

  res.status(HTTP_STATUS_CODES.OK).json({
    message: "Recent events fetched successfully",
    data,
  });
});

export const getUserAttendanceData = asyncHandler(async (req, res, _next) => {
  const { startDate, endDate } = req.query;

  const data = await dashboardUserService.getUserAttendanceData(
    parseInt(req.user.id),
    startDate,
    endDate
  );

  res.status(HTTP_STATUS_CODES.OK).json({
    message: "User attendance data fetched successfully",
    data,
  });
});

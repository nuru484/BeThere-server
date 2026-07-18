// src/controllers/dashboard/admin.js
//
// Thin HTTP adapters over the admin dashboard service.
import { asyncHandler } from "../../middleware/error-handler.js";
import { HTTP_STATUS_CODES } from "../../config/constants.js";
import * as dashboardAdminService from "../../services/dashboard-admin.service.js";

export const getAdminDashboardTotals = asyncHandler(async (req, res, _next) => {
  const data = await dashboardAdminService.getAdminDashboardTotals();

  res.status(HTTP_STATUS_CODES.OK).json({
    message: "Admin dashboard totals fetched successfully",
    data,
  });
});

export const getAllUsersAttendanceData = asyncHandler(
  async (req, res, _next) => {
    const { startDate, endDate } = req.query;

    const data = await dashboardAdminService.getAllUsersAttendanceData(
      startDate,
      endDate
    );

    res.status(HTTP_STATUS_CODES.OK).json({
      message: "All users attendance data fetched successfully",
      data,
    });
  }
);

// src/controllers/dashboard/user-analytics.js
//
// Thin HTTP adapters over the attendant analytics service. Every handler
// scopes to the signed-in user (req.user.id) and asserts the attendant role.
import { asyncHandler } from "../../middleware/error-handler.js";
import { HTTP_STATUS_CODES } from "../../config/constants.js";
import { assertAttendant } from "../../utils/authorization.js";
import * as userAnalytics from "../../services/analytics/user-analytics.service.js";

const userId = (req) => parseInt(req.user.id);
const rangeParams = (req) => {
  const { preset, startDate, endDate } = req.query;
  return { preset, startDate, endDate };
};

export const getUserNowNext = asyncHandler(async (req, res, _next) => {
  assertAttendant(req.user);
  const data = await userAnalytics.getUserNowNext(userId(req));
  res.status(HTTP_STATUS_CODES.OK).json({ message: "Now/next fetched successfully", data });
});

export const getUserKpis = asyncHandler(async (req, res, _next) => {
  assertAttendant(req.user);
  const data = await userAnalytics.getUserKpis(userId(req), rangeParams(req));
  res.status(HTTP_STATUS_CODES.OK).json({ message: "User KPIs fetched successfully", data });
});

export const getUserAttendanceTrend = asyncHandler(async (req, res, _next) => {
  assertAttendant(req.user);
  const data = await userAnalytics.getUserAttendanceTrend(userId(req), rangeParams(req));
  res.status(HTTP_STATUS_CODES.OK).json({ message: "Attendance trend fetched successfully", data });
});

export const getUserStatusBreakdown = asyncHandler(async (req, res, _next) => {
  assertAttendant(req.user);
  const data = await userAnalytics.getUserStatusBreakdown(userId(req), rangeParams(req));
  res.status(HTTP_STATUS_CODES.OK).json({ message: "Status breakdown fetched successfully", data });
});

export const getUserEventBreakdown = asyncHandler(async (req, res, _next) => {
  assertAttendant(req.user);
  const data = await userAnalytics.getUserEventBreakdown(userId(req), rangeParams(req));
  res.status(HTTP_STATUS_CODES.OK).json({ message: "Event breakdown fetched successfully", data });
});

export const getUserCalendar = asyncHandler(async (req, res, _next) => {
  assertAttendant(req.user);
  const data = await userAnalytics.getUserCalendar(userId(req), rangeParams(req));
  res.status(HTTP_STATUS_CODES.OK).json({ message: "Calendar fetched successfully", data });
});

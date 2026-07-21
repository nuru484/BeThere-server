// src/controllers/dashboard/admin-analytics.js
//
// Thin HTTP adapters over the admin analytics services. Each handler pulls the
// range query params and returns the standard { message, data } envelope.
import { asyncHandler } from "../../middleware/error-handler.js";
import { HTTP_STATUS_CODES } from "../../config/constants.js";
import * as adminOverview from "../../services/analytics/admin-overview.service.js";
import * as adminPresence from "../../services/analytics/admin-presence.service.js";
import * as adminPunctuality from "../../services/analytics/admin-punctuality.service.js";
import * as adminIntegrity from "../../services/analytics/admin-integrity.service.js";
import * as adminEngagement from "../../services/analytics/admin-engagement.service.js";
import * as aiReport from "../../services/analytics/ai-report.service.js";

export const getAdminLiveSnapshot = asyncHandler(async (req, res, _next) => {
  const data = await adminOverview.getAdminLiveSnapshot();

  res.status(HTTP_STATUS_CODES.OK).json({
    message: "Live snapshot fetched successfully",
    data,
  });
});

export const getAdminKpis = asyncHandler(async (req, res, _next) => {
  const { preset, startDate, endDate } = req.query;

  const data = await adminOverview.getAdminKpis({ preset, startDate, endDate });

  res.status(HTTP_STATUS_CODES.OK).json({
    message: "Admin KPIs fetched successfully",
    data,
  });
});

export const getPresenceTrend = asyncHandler(async (req, res, _next) => {
  const { preset, startDate, endDate } = req.query;

  const data = await adminPresence.getPresenceTrend({ preset, startDate, endDate });

  res.status(HTTP_STATUS_CODES.OK).json({
    message: "Presence trend fetched successfully",
    data,
  });
});

export const getPresenceBreakdown = asyncHandler(async (req, res, _next) => {
  const { preset, startDate, endDate, by } = req.query;

  const dimension = typeof by === "string" ? by : "status";
  const data = await adminPresence.getPresenceBreakdown(
    { preset, startDate, endDate },
    dimension
  );

  res.status(HTTP_STATUS_CODES.OK).json({
    message: "Presence breakdown fetched successfully",
    data,
  });
});

export const getPunctualityTrend = asyncHandler(async (req, res, _next) => {
  const { preset, startDate, endDate } = req.query;

  const data = await adminPunctuality.getPunctualityTrend({ preset, startDate, endDate });

  res.status(HTTP_STATUS_CODES.OK).json({
    message: "Punctuality trend fetched successfully",
    data,
  });
});

export const getLatenessDistribution = asyncHandler(async (req, res, _next) => {
  const { preset, startDate, endDate } = req.query;

  const data = await adminPunctuality.getLatenessDistribution({ preset, startDate, endDate });

  res.status(HTTP_STATUS_CODES.OK).json({
    message: "Lateness distribution fetched successfully",
    data,
  });
});

export const getArrivalHeatmap = asyncHandler(async (req, res, _next) => {
  const { preset, startDate, endDate } = req.query;

  const data = await adminPunctuality.getArrivalHeatmap({ preset, startDate, endDate });

  res.status(HTTP_STATUS_CODES.OK).json({
    message: "Arrival heatmap fetched successfully",
    data,
  });
});

export const getAnomalyTrend = asyncHandler(async (req, res, _next) => {
  const { preset, startDate, endDate } = req.query;

  const data = await adminIntegrity.getAnomalyTrend({ preset, startDate, endDate });

  res.status(HTTP_STATUS_CODES.OK).json({
    message: "Anomaly trend fetched successfully",
    data,
  });
});

export const getAnomalyBreakdown = asyncHandler(async (req, res, _next) => {
  const { preset, startDate, endDate, by } = req.query;

  const dimension = typeof by === "string" ? by : "type";
  const data = await adminIntegrity.getAnomalyBreakdown(
    { preset, startDate, endDate },
    dimension
  );

  res.status(HTTP_STATUS_CODES.OK).json({
    message: "Anomaly breakdown fetched successfully",
    data,
  });
});

export const getLivenessQuality = asyncHandler(async (req, res, _next) => {
  const { preset, startDate, endDate } = req.query;

  const data = await adminIntegrity.getLivenessQuality({ preset, startDate, endDate });

  res.status(HTTP_STATUS_CODES.OK).json({
    message: "Liveness quality fetched successfully",
    data,
  });
});

export const getIntegritySummary = asyncHandler(async (req, res, _next) => {
  const { preset, startDate, endDate } = req.query;

  const data = await adminIntegrity.getIntegritySummary({ preset, startDate, endDate });

  res.status(HTTP_STATUS_CODES.OK).json({
    message: "Integrity summary fetched successfully",
    data,
  });
});

export const getTopAttendees = asyncHandler(async (req, res, _next) => {
  const { preset, startDate, endDate, limit } = req.query;

  const data = await adminEngagement.getTopAttendees(
    { preset, startDate, endDate },
    limit
  );

  res.status(HTTP_STATUS_CODES.OK).json({
    message: "Top attendees fetched successfully",
    data,
  });
});

export const getRetentionCurve = asyncHandler(async (req, res, _next) => {
  const { eventId } = req.query;

  const parsedEventId = eventId ? Number.parseInt(eventId, 10) : undefined;
  const data = await adminEngagement.getRetentionCurve(
    Number.isNaN(parsedEventId) ? undefined : parsedEventId
  );

  res.status(HTTP_STATUS_CODES.OK).json({
    message: "Retention curve fetched successfully",
    data,
  });
});

export const getAdminAiSummary = asyncHandler(async (req, res, _next) => {
  const { preset, startDate, endDate } = req.body ?? {};

  const data = await aiReport.generateAdminAiSummary({ preset, startDate, endDate });

  res.status(HTTP_STATUS_CODES.OK).json({
    message: data.configured ? "AI summary generated" : "AI summary not configured",
    data,
  });
});

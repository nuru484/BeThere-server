// src/controllers/detective.js
//
// Thin HTTP adapters over the detective read service (admin review surface).
import { asyncHandler } from "../middleware/error-handler.js";
import { HTTP_STATUS_CODES } from "../config/constants.js";
import { parsePagination, paginationMeta } from "../utils/pagination.js";
import { parseId } from "../utils/parse-id.js";
import * as detectiveService from "../services/detective.service.js";

export const getAuditLogs = asyncHandler(async (req, res, _next) => {
  const { page, limit, skip } = parsePagination(req.query);
  const { logs, total } = await detectiveService.listAuditLogs({
    skip,
    limit,
    action: req.query.action,
    actorKind: req.query.actorKind,
  });

  res.status(HTTP_STATUS_CODES.OK).json({
    message: "Audit log fetched successfully.",
    data: logs,
    meta: paginationMeta(total, page, limit),
  });
});

export const getAnomalies = asyncHandler(async (req, res, _next) => {
  const { page, limit, skip } = parsePagination(req.query);
  const { anomalies, total } = await detectiveService.listAnomalies({
    skip,
    limit,
    resolved: req.query.resolved,
    type: req.query.type,
  });

  res.status(HTTP_STATUS_CODES.OK).json({
    message: "Anomaly flags fetched successfully.",
    data: anomalies,
    meta: paginationMeta(total, page, limit),
  });
});

export const resolveAnomaly = asyncHandler(async (req, res, _next) => {
  const anomalyId = parseId(req.params.anomalyId, "Valid anomaly ID is required.");
  await detectiveService.resolveAnomaly(anomalyId, req.user, req.ip);

  res.status(HTTP_STATUS_CODES.OK).json({
    message: "Anomaly marked as resolved.",
  });
});

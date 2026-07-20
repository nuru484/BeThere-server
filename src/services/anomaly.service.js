// src/services/anomaly.service.js
//
// Detective controls: reviewable signals that a check-in attempt looked wrong.
// These do NOT block a check-in on their own (the liveness/geofence gates do
// that); they record an audit trail a manager can review. Writes are
// best-effort so anomaly bookkeeping never breaks a legitimate check-in.
import { prisma } from "../config/prisma-client.js";
import logger from "../utils/logger.js";

/** Records one anomaly flag. Never throws. Returns the row or null. */
export async function flagAnomaly({
  userId,
  eventId = null,
  type,
  severity = "MEDIUM",
  detail = null,
  evidenceId = null,
}) {
  try {
    return await prisma.anomalyFlag.create({
      data: { userId, eventId, type, severity, detail: detail ?? undefined, evidenceId },
    });
  } catch (error) {
    logger.error(error, `Failed to record anomaly ${type} for user ${userId}`);
    return null;
  }
}

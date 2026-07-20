// src/services/detective.service.js
//
// Read surface for the detective controls that the attendance flow writes:
// the append-only audit log, the anomaly flags, and the flagged-attempt
// evidence they reference. Admin-only; these are how a manager actually
// reviews the trail the system collects, closing the "write-only" gap.
import { prisma } from "../config/prisma-client.js";
import {
  NotFoundError,
  ValidationError,
} from "../middleware/error-handler.js";
import { auditLogWrite } from "./audit.service.js";
import {
  parseSearchFilter,
} from "./attendance-query.service.js";
import { toClientFrameUrl } from "./attendance-evidence.service.js";

const ANOMALY_TYPES = [
  "DUPLICATE_DESCRIPTOR",
  "LIVENESS_FAILED",
  "REPLAY_SUSPECTED",
  "RAPID_ATTEMPTS",
];

/** Validates the anomaly-type filter against the enum so a bad value is a
 * clean 400 field error, not a PrismaClientValidationError. */
function parseAnomalyTypeFilter(type) {
  const value = parseSearchFilter(type);
  if (value === undefined) return undefined;
  const upper = value.toUpperCase();
  if (!ANOMALY_TYPES.includes(upper)) {
    throw new ValidationError(
      `Invalid anomaly type. Must be one of: ${ANOMALY_TYPES.join(", ")}`
    );
  }
  return upper;
}

/** Paginated audit log, newest first, with optional action/actorKind filters. */
export async function listAuditLogs({
  skip,
  limit,
  action: rawAction,
  actorKind: rawActorKind,
}) {
  // Scalar coercion: `?action[]=x` must 400, never reach Prisma as an array.
  const action = parseSearchFilter(rawAction);
  const actorKind = parseSearchFilter(rawActorKind);
  const where = {};
  if (action) where.action = action;
  if (actorKind) where.actorKind = actorKind;

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { logs, total };
}

/**
 * Paginated anomaly flags, newest first, filterable by resolved state and
 * type. Each row is enriched (FK-less schema) with the attendant's display
 * fields and the retained evidence frames, so the UI can show who/what/where
 * without extra round-trips.
 */
export async function listAnomalies({ skip, limit, resolved, type: rawType }) {
  const type = parseAnomalyTypeFilter(rawType);
  const where = {};
  if (resolved === "true") where.resolvedAt = { not: null };
  else if (resolved === "false") where.resolvedAt = null;
  if (type) where.type = type;

  const [rows, total] = await Promise.all([
    prisma.anomalyFlag.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.anomalyFlag.count({ where }),
  ]);

  const userIds = [...new Set(rows.map((r) => r.userId))];
  const evidenceIds = rows.map((r) => r.evidenceId).filter((id) => id != null);

  const [users, evidence] = await Promise.all([
    userIds.length
      ? prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [],
    evidenceIds.length
      ? prisma.attendanceEvidence.findMany({
          where: { id: { in: evidenceIds } },
          select: {
            id: true,
            frameUrls: true,
            livenessScore: true,
            matchDistance: true,
          },
        })
      : [],
  ]);

  const userById = new Map(users.map((u) => [u.id, u]));
  // Stored frame values are public ids (or legacy URLs); sign them into
  // short-lived URLs here so the response never carries standing access to
  // biometric frames.
  const evidenceById = new Map(
    evidence.map((e) => [
      e.id,
      {
        ...e,
        frameUrls: (Array.isArray(e.frameUrls) ? e.frameUrls : []).map(
          toClientFrameUrl
        ),
      },
    ])
  );

  const anomalies = rows.map((row) => ({
    id: row.id,
    type: row.type,
    severity: row.severity,
    detail: row.detail,
    eventId: row.eventId,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
    // A soft-deleted attendant reads as null here; the UI falls back to the id.
    user: userById.get(row.userId) ?? null,
    evidence: row.evidenceId ? (evidenceById.get(row.evidenceId) ?? null) : null,
  }));

  return { anomalies, total };
}

/** Marks an anomaly reviewed. Idempotent-ish; 404 when the id is unknown. */
export async function resolveAnomaly(anomalyId, actor, ip) {
  const flag = await prisma.anomalyFlag.findUnique({ where: { id: anomalyId } });
  if (!flag) {
    throw new NotFoundError("Anomaly not found.");
  }

  // One transaction: the resolution and its audit entry land together, so a
  // crash cannot mark an anomaly reviewed without a trace of who reviewed it.
  const [updated] = await prisma.$transaction([
    prisma.anomalyFlag.update({
      where: { id: anomalyId },
      data: { resolvedAt: new Date() },
    }),
    auditLogWrite({
      actorKind: actor?.kind ?? "ADMIN",
      actorId: actor ? parseInt(actor.id) : null,
      action: "ANOMALY_RESOLVED",
      targetType: "AnomalyFlag",
      targetId: anomalyId,
      ip,
    }),
  ]);

  return updated;
}

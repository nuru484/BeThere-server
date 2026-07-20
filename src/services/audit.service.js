// src/services/audit.service.js
//
// Append-only audit trail for security-relevant actions (check-ins, admin
// mutations of user/biometric data). Writes are best-effort: an audit failure
// must never break the operation it records, so it is logged and swallowed.
// The actor is polymorphic (kind + id) like the other security rows.
import { prisma } from "../config/prisma-client.js";
import logger from "../utils/logger.js";

/**
 * Records one audit entry. Never throws.
 * @param {{ actorKind?: string, actorId?: number|null, action: string,
 *   targetType?: string, targetId?: number|null, metadata?: object, ip?: string }} entry
 */
export async function recordAudit(entry) {
  try {
    await prisma.auditLog.create({
      data: {
        actorKind: entry.actorKind ?? "SYSTEM",
        actorId: entry.actorId ?? null,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        metadata: entry.metadata ?? undefined,
        ip: entry.ip ?? null,
      },
    });
  } catch (error) {
    logger.error(error, `Failed to write audit log for action ${entry.action}`);
  }
}

/** Retention: trims audit entries older than the given cutoff. */
export async function cleanupOldAuditLogs(olderThan) {
  const { count } = await prisma.auditLog.deleteMany({
    where: { createdAt: { lt: olderThan } },
  });
  return count;
}

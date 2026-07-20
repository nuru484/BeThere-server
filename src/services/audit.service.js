// src/services/audit.service.js
//
// Append-only audit trail for security-relevant actions (check-ins, admin
// mutations of user/biometric data). Writes are best-effort: an audit failure
// must never break the operation it records, so it is logged and swallowed.
// The actor is polymorphic (kind + id) like the other security rows.
import { prisma } from "../config/prisma-client.js";
import logger from "../utils/logger.js";

/**
 * Builds the audit insert WITHOUT executing it, against the given client
 * (defaults to the shared one). Callers wrapping a mutation in a batch
 * $transaction include this alongside their own writes, so the action and
 * its trail commit or roll back as one - unlike recordAudit, a failure here
 * fails the whole transaction on purpose.
 * @param {{ actorKind?: string, actorId?: number|null, action: string,
 *   targetType?: string, targetId?: number|null, metadata?: object, ip?: string }} entry
 * @param {typeof prisma} [db] Prisma client or transaction client.
 */
export function auditLogWrite(entry, db = prisma) {
  return db.auditLog.create({
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
}

/**
 * Records one audit entry. Never throws.
 * @param {{ actorKind?: string, actorId?: number|null, action: string,
 *   targetType?: string, targetId?: number|null, metadata?: object, ip?: string }} entry
 */
export async function recordAudit(entry) {
  try {
    await auditLogWrite(entry);
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

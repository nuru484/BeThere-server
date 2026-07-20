// src/services/session-finalizer.service.js
//
// Closes the books on finished sessions. Until this ran, ABSENT was an
// unreachable status: attendance rows were only ever created by check-in
// (PRESENT/LATE), so every absence metric in the product was permanently
// zero, and a user who checked in but never checked out kept an open row
// forever.
//
// For every session whose daily window (event.endTime in the venue timezone,
// plus a grace period) has closed and that has not been finalized yet:
//   1. every active attendant WITHOUT a row for that session gets an ABSENT
//      row (createMany + skipDuplicates: idempotent, race-safe),
//   2. rows checked in but never out get checkOutTime stamped to the
//      session's end with autoCheckedOut = true, so the client can render
//      "signed out by system" - a real face-verified check-out it is not,
//   3. the session's finalizedAt is stamped, guarding the whole step against
//      re-runs.
// All three land in ONE transaction per session. The audit entry is written
// by the SYSTEM actor: the finalizer acts, never the user.
import { prisma } from "../config/prisma-client.js";
import { SESSION_FINALIZER } from "../config/constants.js";
import { addUtcDays, eventCalendarDay, eventTimeOnDay } from "../utils/time-context.js";
import { auditLogWrite } from "./audit.service.js";
import logger from "../utils/logger.js";

/**
 * Finalizes one session (already loaded with its event). Exported for tests.
 * Returns a summary or null when the session was already finalized (raced by
 * a concurrent sweep).
 */
export async function finalizeSession(session, { markAbsences, now = new Date() }) {
  const sessionEnd = eventTimeOnDay(session.startDate, session.event.endTime);

  return prisma.$transaction(async (tx) => {
    // Atomic claim: two overlapping sweeps cannot finalize the same session
    // twice (the loser reads count 0 and backs off).
    const claimed = await tx.session.updateMany({
      where: { id: session.id, finalizedAt: null },
      data: { finalizedAt: now },
    });
    if (claimed.count === 0) return null;

    let absentCreated = 0;
    let autoCheckedOut = 0;

    if (markAbsences) {
      // Soft-deleted attendants are excluded by the Prisma extension's
      // default scope on findMany.
      const activeUsers = await tx.user.findMany({ select: { id: true } });
      const existing = await tx.attendance.findMany({
        where: { sessionId: session.id },
        select: { userId: true },
      });
      const covered = new Set(existing.map((row) => row.userId));

      const absentRows = activeUsers
        .filter((user) => !covered.has(user.id))
        .map((user) => ({
          userId: user.id,
          sessionId: session.id,
          status: "ABSENT",
        }));

      if (absentRows.length > 0) {
        // skipDuplicates: a check-in racing this transaction wins on the
        // (userId, sessionId) unique constraint instead of failing the batch.
        const created = await tx.attendance.createMany({
          data: absentRows,
          skipDuplicates: true,
        });
        absentCreated = created.count;
      }

      const closed = await tx.attendance.updateMany({
        where: {
          sessionId: session.id,
          checkInTime: { not: null },
          checkOutTime: null,
        },
        data: { checkOutTime: sessionEnd, autoCheckedOut: true },
      });
      autoCheckedOut = closed.count;
    }

    // SYSTEM attribution, in the same transaction: the audit trail must never
    // read as if the users signed themselves out.
    await auditLogWrite(
      {
        actorKind: "SYSTEM",
        actorId: null,
        action: "SESSION_FINALIZED",
        targetType: "Session",
        targetId: session.id,
        metadata: {
          eventId: session.eventId,
          absentCreated,
          autoCheckedOut,
          markAbsences,
        },
      },
      tx
    );

    return { sessionId: session.id, absentCreated, autoCheckedOut };
  });
}

/**
 * The sweep: finds every unfinalized session whose window has closed and
 * finalizes it. Sessions older than the lookback are stamped finalized
 * WITHOUT absence marking - fabricating retroactive ABSENT rows for history
 * that predates this feature (or a long outage) would poison the data, and
 * users created after those sessions would read as absent from them.
 */
export async function finalizeDueSessions(now = new Date()) {
  const today = eventCalendarDay(now);
  const lookbackStart = addUtcDays(today, -SESSION_FINALIZER.LOOKBACK_DAYS);

  // SQL narrows to plausible candidates (unfinalized, day started); the
  // venue-timezone end-plus-grace cutoff needs the event's HH:MM string, so
  // it runs in JS on the already-small set.
  const candidates = await prisma.session.findMany({
    where: {
      finalizedAt: null,
      startDate: { lte: today },
    },
    include: { event: true },
    orderBy: { startDate: "asc" },
  });

  const summary = { finalized: 0, absentCreated: 0, autoCheckedOut: 0, skippedHistorical: 0 };

  for (const session of candidates) {
    const sessionEnd = eventTimeOnDay(session.startDate, session.event.endTime);
    if (now.getTime() - sessionEnd.getTime() < SESSION_FINALIZER.GRACE_MS) {
      continue; // Window (plus grace) still open.
    }

    // No retroactive absences for history beyond the lookback, nor for
    // sessions whose event was soft-deleted or archived after they ran -
    // those are stamped finalized so the sweep stops revisiting them.
    const markAbsences =
      session.startDate >= lookbackStart &&
      !session.event.deletedAt &&
      !session.event.archived;

    try {
      const result = await finalizeSession(session, { markAbsences, now });
      if (!result) continue;
      summary.finalized++;
      summary.absentCreated += result.absentCreated;
      summary.autoCheckedOut += result.autoCheckedOut;
      if (!markAbsences) summary.skippedHistorical++;
    } catch (error) {
      // One bad session must not stall the sweep; the next run retries it.
      logger.error(error, `Failed to finalize session ${session.id}`);
    }
  }

  if (summary.finalized > 0) {
    logger.info({ sessionFinalizer: summary }, "Session finalization sweep complete");
  }
  return summary;
}

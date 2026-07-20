// src/services/attendance.service.js
//
// Check-in and check-out share one trust model: prove PRESENCE (a live,
// rotating venue code scanned at the location) and IDENTITY (server-side face
// liveness against the enrolled template). Both are verified server-side from a
// scanned code and raw uploaded frames - never from a client-computed verdict.
// The flow is two steps: a fail-fast challenge preflight (code + enrollment +
// window) issues a single-use, mode-scoped liveness challenge; the client then
// uploads frames performing the randomized actions.
import { startOfDay } from "date-fns";
import { prisma } from "../config/prisma-client.js";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from "../middleware/error-handler.js";
import { isFaceDescriptor } from "../utils/face-match.js";
import { decryptTemplate } from "../utils/biometric-crypto.js";
import { todayAtEventTime } from "../utils/time-context.js";
import { consumeChallenge, issueChallenge } from "./liveness-challenge.service.js";
import { getLivenessVerifier } from "./liveness/liveness-verifier.js";
import { storeEvidence } from "./attendance-evidence.service.js";
import { flagAnomaly } from "./anomaly.service.js";
import { recordAudit } from "./audit.service.js";
import { ensureVenueSecret, isValidVenueCode } from "./venue-code.service.js";
import logger from "../utils/logger.js";

/** Both mutations answer with the session (+event) and a minimal user. */
const ATTENDANCE_INCLUDE = {
  session: {
    include: {
      event: true,
    },
  },
  user: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
    },
  },
};

/** The actor's account; soft-deleted accounts read as absent. */
async function findUserOrThrow(userId) {
  const user = await prisma.user.findFirst({ where: { id: userId } });
  if (!user) {
    throw new NotFoundError(`User with ID ${userId} not found.`);
  }
  return user;
}

/** The event; soft-deleted events read as absent. */
async function findEventOrThrow(eventId) {
  const event = await prisma.event.findFirst({ where: { id: eventId } });
  if (!event) {
    throw new NotFoundError(`Event with ID ${eventId} not found.`);
  }
  return event;
}

/** The session whose date range covers `now`, or null when none is active. */
export async function resolveActiveSession(eventId, now) {
  const currentDate = startOfDay(now);
  return prisma.session.findFirst({
    where: {
      eventId,
      startDate: { lte: currentDate },
      endDate: { gte: currentDate },
    },
    orderBy: { startDate: "desc" },
  });
}

/**
 * Resolves the enrolled template for a user, decrypting the at-rest ciphertext
 * (falling back to the legacy plaintext column during the migration window).
 * Throws when nothing valid is enrolled.
 */
function resolveEnrolledDescriptor(user) {
  let enrolled = null;
  if (user.faceScanEnc) {
    try {
      enrolled = decryptTemplate(user.faceScanEnc);
    } catch (error) {
      logger.error(error, `Corrupt face template for user ${user.id}`);
      throw new BadRequestError(
        "Your enrolled face could not be read. Please contact an admin to re-enroll."
      );
    }
  } else if (user.faceScan) {
    enrolled = user.faceScan; // Legacy plaintext, pending backfill.
  }

  if (!isFaceDescriptor(enrolled)) {
    throw new BadRequestError(
      "No enrolled face found for your account. Please contact an admin to enroll your face scan."
    );
  }
  return enrolled;
}

/** Cheap enrollment presence check (no decrypt) for the challenge preflight. */
function assertEnrolled(user) {
  if (!user.faceScanEnc && !user.faceScan) {
    throw new BadRequestError(
      "No enrolled face found for your account. Please contact an admin to enroll your face scan."
    );
  }
}

/** Validates the scanned rotating venue code against the event's secret. */
async function assertValidVenueCode(eventId, venueCode) {
  const secret = await ensureVenueSecret(eventId);
  if (!secret) {
    throw new NotFoundError(`Event with ID ${eventId} not found.`);
  }
  if (!isValidVenueCode(secret, venueCode)) {
    throw new BadRequestError(
      "Invalid or expired venue code. Please scan the code shown at the event location."
    );
  }
}

/**
 * Enforces the active session + daily window (venue timezone), returning the
 * session and the PRESENT/LATE status. Shared cheap gate before the ML step.
 */
async function resolveSessionForCheckIn(event, now) {
  const currentDate = startOfDay(now);
  const currentSession = await resolveActiveSession(event.id, now);

  if (!currentSession) {
    throw new BadRequestError(
      "No active session for this event at the moment. Please wait for the next session to check in."
    );
  }
  if (currentDate > new Date(currentSession.endDate)) {
    throw new BadRequestError(
      "The current session has ended. Please wait for the next session to check in."
    );
  }

  const sessionStartTime = todayAtEventTime(event.startTime, now);
  const sessionEndTime = todayAtEventTime(event.endTime, now);

  if (now < sessionStartTime) {
    throw new BadRequestError(
      `Check-in is not yet open. Please check in after ${event.startTime}.`
    );
  }
  if (now > sessionEndTime) {
    throw new BadRequestError(
      `Check-in is closed for today. The check-in window was ${event.startTime} - ${event.endTime}.`
    );
  }

  const oneHourAfterStart = new Date(sessionStartTime);
  oneHourAfterStart.setHours(oneHourAfterStart.getHours() + 1);
  const status = now <= oneHourAfterStart ? "PRESENT" : "LATE";

  return { currentSession, status };
}

/**
 * Runs server-side liveness and throws on failure, recording the failed
 * attempt as flagged evidence + an anomaly + an audit entry. Shared by both
 * check-in and check-out. Returns the verdict on success.
 */
async function runLivenessOrThrow({ userId, eventId, enrolled, actions, frameBuffers, ip, action }) {
  const verdict = await getLivenessVerifier().verify({
    frameBuffers,
    enrolledDescriptor: enrolled,
    actions,
  });

  if (!verdict.passed) {
    const anomalyType = verdict.replaySuspected
      ? "REPLAY_SUSPECTED"
      : "LIVENESS_FAILED";
    const evidence = await storeEvidence({
      userId,
      eventId,
      frameBuffers,
      livenessScore: verdict.score,
      matchDistance: verdict.matchDistance,
      reason: verdict.reasons.join(","),
    }).catch((error) => {
      logger.error(error, "Failed to store liveness-failure evidence");
      return null;
    });

    await flagAnomaly({
      userId,
      eventId,
      type: anomalyType,
      severity: verdict.replaySuspected ? "HIGH" : "MEDIUM",
      detail: { action, reasons: verdict.reasons, failedActions: verdict.failedActions },
      evidenceId: evidence?.id ?? null,
    });

    await recordAudit({
      actorKind: "USER",
      actorId: userId,
      action: `${action}_LIVENESS_FAILED`,
      targetType: "Event",
      targetId: eventId,
      metadata: { reasons: verdict.reasons },
      ip,
    });

    throw new UnauthorizedError(
      "Face verification failed. Please make sure you are in good lighting and follow the on-screen actions, then try again."
    );
  }

  return verdict;
}

/**
 * Step 1 (both directions): the fail-fast preflight. Validates the scanned
 * venue code, enrollment, the session window, and the mode-specific attendance
 * state - BEFORE issuing a challenge or spending any ML. Returns the randomized
 * actions + signed, mode-scoped challenge token.
 */
export async function prepareAttendanceChallenge(
  userId,
  eventId,
  { venueCode, mode = "in" }
) {
  const user = await findUserOrThrow(userId);
  assertEnrolled(user);

  await assertValidVenueCode(eventId, venueCode);

  const event = await findEventOrThrow(eventId);
  const now = new Date();
  const { currentSession } = await resolveSessionForCheckIn(event, now);

  const existing = await prisma.attendance.findUnique({
    where: { userId_sessionId: { userId, sessionId: currentSession.id } },
  });

  if (mode === "out") {
    if (!existing) {
      throw new NotFoundError(
        "No check-in found for this session. You must check in before checking out."
      );
    }
    if (existing.checkOutTime) {
      throw new ConflictError("You have already checked out of this session.");
    }
  } else if (existing) {
    throw new ConflictError("You have already checked in for this session.");
  }

  return issueChallenge({ userId, eventId, mode });
}

/**
 * Step 2, check-in: consumes the check-in challenge, verifies liveness against
 * the enrolled template, and records PRESENT/LATE. A failed attempt is recorded
 * as evidence + an anomaly, not silently dropped.
 */
export async function checkIn(userId, eventId, { frameBuffers, challengeToken, ip }) {
  const user = await findUserOrThrow(userId);
  const enrolled = resolveEnrolledDescriptor(user);

  const event = await findEventOrThrow(eventId);
  const now = new Date();
  const { currentSession, status } = await resolveSessionForCheckIn(event, now);

  const existingAttendance = await prisma.attendance.findUnique({
    where: { userId_sessionId: { userId, sessionId: currentSession.id } },
  });
  if (existingAttendance) {
    throw new ConflictError("You have already checked in for this session.");
  }

  const { actions } = await consumeChallenge({
    token: challengeToken,
    userId,
    eventId,
    mode: "in",
  });

  const verdict = await runLivenessOrThrow({
    userId,
    eventId,
    enrolled,
    actions,
    frameBuffers,
    ip,
    action: "CHECK_IN",
  });

  const attendance = await prisma.attendance.create({
    data: { userId, sessionId: currentSession.id, checkInTime: now, status },
    include: ATTENDANCE_INCLUDE,
  });

  await prisma.user.update({
    where: { id: userId },
    data: { faceLastUsedAt: now },
  });
  await recordAudit({
    actorKind: "USER",
    actorId: userId,
    action: "CHECK_IN",
    targetType: "Event",
    targetId: eventId,
    metadata: { status, sessionId: currentSession.id, livenessScore: verdict.score },
    ip,
  });

  return attendance;
}

/**
 * Step 2, check-out: consumes the check-out challenge, verifies liveness (same
 * as check-in), and stamps the check-out time within the window.
 */
export async function checkOut(userId, eventId, { frameBuffers, challengeToken, ip }) {
  const user = await findUserOrThrow(userId);
  const enrolled = resolveEnrolledDescriptor(user);

  const event = await findEventOrThrow(eventId);
  const now = new Date();

  const currentSession = await resolveActiveSession(eventId, now);
  if (!currentSession) {
    throw new NotFoundError(
      "No active session found for this event at the moment."
    );
  }

  const existingAttendance = await prisma.attendance.findUnique({
    where: { userId_sessionId: { userId, sessionId: currentSession.id } },
  });

  if (!existingAttendance) {
    throw new NotFoundError(
      "No attendance record found. You must check in to the event first."
    );
  }
  if (existingAttendance.checkOutTime) {
    throw new ConflictError("You have already checked out of this session.");
  }

  const sessionEndTime = todayAtEventTime(event.endTime, now);
  if (now > sessionEndTime) {
    throw new BadRequestError(
      `Check-out window has closed. The check-out deadline was ${event.endTime}.`
    );
  }
  if (now <= existingAttendance.checkInTime) {
    throw new BadRequestError("Check-out time must be after check-in time.");
  }

  const { actions } = await consumeChallenge({
    token: challengeToken,
    userId,
    eventId,
    mode: "out",
  });

  await runLivenessOrThrow({
    userId,
    eventId,
    enrolled,
    actions,
    frameBuffers,
    ip,
    action: "CHECK_OUT",
  });

  const updated = await prisma.attendance.update({
    where: { userId_sessionId: { userId, sessionId: currentSession.id } },
    data: { checkOutTime: now },
    include: ATTENDANCE_INCLUDE,
  });

  await recordAudit({
    actorKind: "USER",
    actorId: userId,
    action: "CHECK_OUT",
    targetType: "Event",
    targetId: eventId,
    metadata: { sessionId: currentSession.id },
    ip,
  });

  return updated;
}

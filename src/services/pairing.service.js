// src/services/pairing.service.js
//
// Cross-device "scan from phone" hand-off. A cookie-authenticated laptop starts
// a pairing and gets a short-lived SIGNED hand-off token plus a pairing id. The
// laptop renders the token in a QR deep-link; the phone opens it, does the
// scan authenticated ONLY by that token (never a full session), and the session
// is marked COMPLETED. The laptop polls the session to learn it finished.
//
// The token is deliberately narrow: it carries a REMOTE_CAPTURE purpose bound to
// one user + one pairing + one scope/event/mode, and it is honored only by the
// /pairing capture endpoints (see authenticate-handoff.js). It cannot be used as
// a session cookie or against any other route.
import jwt from "jsonwebtoken";
import ENV from "../config/env.js";
import { prisma } from "../config/prisma-client.js";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "../middleware/error-handler.js";
import { JWT_ALGORITHMS } from "../utils/verify-jwt-token.js";

const PURPOSE = "REMOTE_CAPTURE";
// Long enough to open the link, scan the venue QR, and perform the actions;
// short enough that a leaked token dies fast. The session row is the authority
// on liveness, so an expired/consumed pairing rejects even a still-valid JWT.
export const PAIRING_TTL_MS = 5 * 60 * 1000;

const VALID_MODES = { ATTENDANCE: ["in", "out"], ENROLL: ["enroll"] };

/**
 * Starts a pairing for the signed-in user and returns the pairing id, the
 * signed hand-off token, and when it expires. ATTENDANCE requires an eventId and
 * an in/out mode; ENROLL takes neither.
 */
export async function startPairing({ userId, scope, eventId, mode }) {
  if (scope !== "ATTENDANCE" && scope !== "ENROLL") {
    throw new BadRequestError("Invalid pairing scope.");
  }

  let resolvedEventId = null;
  let resolvedMode = "enroll";
  if (scope === "ATTENDANCE") {
    if (!Number.isInteger(eventId)) {
      throw new BadRequestError("A valid event is required to pair a check-in.");
    }
    resolvedEventId = eventId;
    resolvedMode = mode === "out" ? "out" : "in";
  }
  if (!VALID_MODES[scope].includes(resolvedMode)) {
    throw new BadRequestError("Invalid pairing mode.");
  }

  const expiresAt = new Date(Date.now() + PAIRING_TTL_MS);
  const session = await prisma.pairingSession.create({
    data: {
      userId,
      scope,
      eventId: resolvedEventId,
      mode: resolvedMode,
      expiresAt,
    },
    select: { id: true, expiresAt: true },
  });

  const handoffToken = jwt.sign(
    {
      purpose: PURPOSE,
      userId,
      pairingId: session.id,
      scope,
      eventId: resolvedEventId,
      mode: resolvedMode,
    },
    ENV.ACCESS_TOKEN_SECRET,
    { expiresIn: Math.floor(PAIRING_TTL_MS / 1000) }
  );

  return { pairingId: session.id, handoffToken, expiresAt: session.expiresAt };
}

/**
 * Verifies a hand-off token AND that its pairing is still live (PENDING, not
 * expired). Returns the capture context the phone is authorized for. Throws on a
 * bad/expired token or a spent/expired session.
 */
export async function verifyHandoffToken(token) {
  if (!token) {
    throw new UnauthorizedError("Missing pairing token.", {
      code: "PAIRING_TOKEN_MISSING",
    });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, ENV.ACCESS_TOKEN_SECRET, {
      algorithms: JWT_ALGORITHMS,
    });
  } catch {
    throw new UnauthorizedError("This pairing link has expired.", {
      code: "PAIRING_EXPIRED",
    });
  }

  if (decoded?.purpose !== PURPOSE || !decoded.pairingId || !decoded.userId) {
    throw new UnauthorizedError("Invalid pairing link.", {
      code: "PAIRING_INVALID",
    });
  }

  const session = await prisma.pairingSession.findUnique({
    where: { id: decoded.pairingId },
    select: {
      id: true,
      userId: true,
      scope: true,
      eventId: true,
      mode: true,
      status: true,
      expiresAt: true,
    },
  });

  if (
    !session ||
    session.userId !== decoded.userId ||
    session.status !== "PENDING" ||
    session.expiresAt <= new Date()
  ) {
    throw new UnauthorizedError(
      "This pairing is no longer active. Start again from your laptop.",
      { code: "PAIRING_INACTIVE" }
    );
  }

  return {
    userId: session.userId,
    pairingId: session.id,
    scope: session.scope,
    eventId: session.eventId,
    mode: session.mode,
  };
}

/** Owner-scoped pairing status the laptop polls. */
export async function getPairingStatus(userId, pairingId) {
  const session = await prisma.pairingSession.findUnique({
    where: { id: pairingId },
    select: {
      userId: true,
      scope: true,
      status: true,
      completedAt: true,
      expiresAt: true,
    },
  });

  if (!session) {
    throw new NotFoundError("Pairing not found.");
  }
  if (session.userId !== userId) {
    throw new ForbiddenError("This pairing belongs to another account.");
  }

  // A lapsed PENDING reads as EXPIRED without a write - the retention sweep
  // deletes it later.
  const status =
    session.status === "PENDING" && session.expiresAt <= new Date()
      ? "EXPIRED"
      : session.status;

  return { status, scope: session.scope, completedAt: session.completedAt };
}

/**
 * Marks a pairing COMPLETED. Guarded so only a live PENDING session flips, and
 * only once. Best-effort: the capture already succeeded, so a lost race here
 * must not fail the user's check-in - the laptop simply keeps polling until it
 * sees the record another way.
 */
export async function completePairing(pairingId) {
  await prisma.pairingSession.updateMany({
    where: { id: pairingId, status: "PENDING" },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
}

/** Retention: drop expired or completed pairing rows. Returns the count. */
export async function cleanupExpiredPairings() {
  const { count } = await prisma.pairingSession.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { status: { not: "PENDING" } },
      ],
    },
  });
  return count;
}

// src/services/liveness-challenge.service.js
//
// Issues and consumes single-use liveness challenges. The randomized action
// sequence is what defeats replay: a pre-recorded capture cannot satisfy
// actions the client learns only after the server picks them. The client
// carries a signed token (same purpose-tagged-JWT pattern as the 2FA pending
// token); the authoritative action list and single-use guarantee live in the
// LivenessChallenge row, consumed atomically like the refresh/OTP flows.
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import ENV from "../config/env.js";
import { prisma } from "../config/prisma-client.js";
import { UnauthorizedError } from "../middleware/error-handler.js";
import { LIVENESS } from "../config/constants.js";
import { JWT_ALGORITHMS } from "../utils/verify-jwt-token.js";
import { decryptTemplate, encryptTemplate } from "../utils/biometric-crypto.js";

const PURPOSE = "LIVENESS_CHALLENGE";
// Step-by-step challenges carry a distinct purpose so a step token can never be
// replayed into the batch endpoint (or vice versa).
const STEP_PURPOSE = "LIVENESS_STEP";

/** Fisher-Yates draw of n distinct actions using a CSPRNG. */
function drawActions(n) {
  const pool = [...LIVENESS.ACTIONS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

/**
 * Issues a challenge for (userId, eventId): persists the row and returns the
 * ordered actions plus a short-lived signed token the client returns with its
 * frames.
 */
export async function issueChallenge({ userId, eventId = null, mode = "in" }) {
  const actions = drawActions(LIVENESS.ACTIONS_PER_CHALLENGE);
  const nonce = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + LIVENESS.CHALLENGE_TTL_MS);

  await prisma.livenessChallenge.create({
    data: { userId, eventId, nonce, actions, expiresAt },
  });

  // mode ("in"/"out") is bound into the signed token so a check-in challenge
  // can never be replayed to drive a check-out, or vice versa.
  const token = jwt.sign(
    { userId, eventId, nonce, mode, purpose: PURPOSE },
    ENV.ACCESS_TOKEN_SECRET,
    { expiresIn: Math.floor(LIVENESS.CHALLENGE_TTL_MS / 1000) }
  );

  return { actions, challengeToken: token, expiresAt };
}

/**
 * Verifies and CONSUMES a challenge for this exact actor/event. Returns the
 * authoritative action list from the row (never trusting the token's copy).
 * Throws on expired/replayed/mismatched tokens - the caller must treat that as
 * a failed check-in.
 */
export async function consumeChallenge({
  token,
  userId,
  eventId = null,
  mode = "in",
}) {
  let decoded;
  try {
    decoded = jwt.verify(token, ENV.ACCESS_TOKEN_SECRET, {
      algorithms: JWT_ALGORITHMS,
    });
  } catch {
    throw new UnauthorizedError(
      "Your check-in session expired. Please start the scan again.",
      { code: "CHALLENGE_EXPIRED" }
    );
  }

  if (
    decoded?.purpose !== PURPOSE ||
    decoded.userId !== userId ||
    decoded.eventId !== eventId ||
    (decoded.mode ?? "in") !== mode ||
    !decoded.nonce
  ) {
    throw new UnauthorizedError("Invalid check-in challenge.", {
      code: "CHALLENGE_INVALID",
    });
  }

  // Atomic single-use consume: a replayed token loses the race and reads 0.
  const consumed = await prisma.livenessChallenge.updateMany({
    where: {
      nonce: decoded.nonce,
      userId,
      eventId,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { consumedAt: new Date() },
  });

  if (consumed.count === 0) {
    throw new UnauthorizedError(
      "This check-in challenge was already used or has expired.",
      { code: "CHALLENGE_CONSUMED" }
    );
  }

  const row = await prisma.livenessChallenge.findUnique({
    where: { nonce: decoded.nonce },
    select: { actions: true },
  });

  // The retention sweep deletes consumed rows, so it can remove this one in
  // the instant between the consume above and this read. Dereferencing a null
  // row would 500 an otherwise legitimate check-in; treat it as a spent
  // challenge so the client restarts the scan cleanly.
  if (!row) {
    throw new UnauthorizedError(
      "This check-in challenge is no longer available. Please start the scan again.",
      { code: "CHALLENGE_CONSUMED" }
    );
  }

  return { actions: row.actions };
}

/**
 * Issues a STEP-BY-STEP challenge: the same randomized action draw, but the
 * client proves one action per upload and the server verifies each before the
 * next is prompted. The row tracks currentStep and (encrypted) cross-step state;
 * the token is longer-lived than a batch challenge because the flow spans
 * several verified round-trips. Returns the actions, the first action to prove,
 * and the signed step token.
 */
export async function issueStepChallenge({
  userId,
  eventId = null,
  mode = "in",
}) {
  const actions = drawActions(LIVENESS.ACTIONS_PER_CHALLENGE);
  const nonce = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + LIVENESS.STEP_CHALLENGE_TTL_MS);

  await prisma.livenessChallenge.create({
    data: { userId, eventId, nonce, actions, expiresAt, currentStep: 0 },
  });

  const token = jwt.sign(
    { userId, eventId, nonce, mode, purpose: STEP_PURPOSE },
    ENV.ACCESS_TOKEN_SECRET,
    { expiresIn: Math.floor(LIVENESS.STEP_CHALLENGE_TTL_MS / 1000) }
  );

  return {
    actions,
    challengeToken: token,
    currentStep: 0,
    nextAction: actions[0],
    totalSteps: actions.length,
    expiresAt,
  };
}

const emptyStepState = () => ({ descriptors: [], firstTurnSign: null });

/**
 * Verifies a step token and loads the LIVE challenge row WITHOUT consuming it,
 * decrypting the accumulated cross-step state. Throws (as an expired/spent
 * challenge) when the token is bad, the row is gone, expired, or already
 * consumed. The caller runs the ML for actions[currentStep] and then advances.
 */
export async function loadStepChallenge({
  token,
  userId,
  eventId = null,
  mode = "in",
}) {
  let decoded;
  try {
    decoded = jwt.verify(token, ENV.ACCESS_TOKEN_SECRET, {
      algorithms: JWT_ALGORITHMS,
    });
  } catch {
    throw new UnauthorizedError(
      "Your scan session expired. Please start the scan again.",
      { code: "CHALLENGE_EXPIRED" }
    );
  }

  if (
    decoded?.purpose !== STEP_PURPOSE ||
    decoded.userId !== userId ||
    decoded.eventId !== eventId ||
    (decoded.mode ?? "in") !== mode ||
    !decoded.nonce
  ) {
    throw new UnauthorizedError("Invalid scan challenge.", {
      code: "CHALLENGE_INVALID",
    });
  }

  const row = await prisma.livenessChallenge.findUnique({
    where: { nonce: decoded.nonce },
    select: {
      actions: true,
      currentStep: true,
      stateEnc: true,
      consumedAt: true,
      expiresAt: true,
    },
  });

  if (!row || row.consumedAt || row.expiresAt <= new Date()) {
    throw new UnauthorizedError(
      "This scan session was already completed or has expired. Please start again.",
      { code: "CHALLENGE_CONSUMED" }
    );
  }

  const state = row.stateEnc
    ? decryptTemplate(row.stateEnc, { userId })
    : emptyStepState();

  return {
    nonce: decoded.nonce,
    actions: row.actions,
    currentStep: row.currentStep,
    state,
  };
}

/**
 * Atomically advances a step-by-step challenge from `fromStep` to the next,
 * persisting the (re-encrypted) accumulated state. The guarded updateMany means
 * a duplicate or out-of-order submit of the same step loses the race and reads
 * 0, so a step can never be double-counted. On the final step it also stamps
 * consumedAt, making the whole challenge single-use. Returns whether it won.
 */
export async function advanceStep({
  nonce,
  userId,
  fromStep,
  state,
  done = false,
}) {
  const data = {
    currentStep: fromStep + 1,
    stateEnc: encryptTemplate(state, { userId }),
  };
  if (done) data.consumedAt = new Date();

  const advanced = await prisma.livenessChallenge.updateMany({
    where: {
      nonce,
      userId,
      currentStep: fromStep,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    data,
  });

  return advanced.count > 0;
}

/** Retention: drops expired/consumed challenge rows. Returns the count. */
export async function cleanupExpiredChallenges() {
  const { count } = await prisma.livenessChallenge.deleteMany({
    where: {
      OR: [{ expiresAt: { lt: new Date() } }, { consumedAt: { not: null } }],
    },
  });
  return count;
}

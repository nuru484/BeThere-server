// src/services/face-scan.service.js
//
// Face template enrollment lifecycle. Two compliance rules live here:
//  1. CONSENT: enrollment is refused without explicit biometric consent
//     (GDPR Art. 9 / BIPA); the consent timestamp + policy version are stored.
//  2. AT-REST ENCRYPTION: the 128-float template is AES-256-GCM encrypted
//     before it touches the database and is decrypted only in memory at match
//     time. The raw descriptor is never returned to any client.
import { prisma } from "../config/prisma-client.js";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "../middleware/error-handler.js";
import { assertSelfOrAdmin } from "../utils/authorization.js";
import { encryptTemplate } from "../utils/biometric-crypto.js";
import { isFaceDescriptor } from "../utils/face-match.js";
import { BIOMETRIC_CONSENT_VERSION } from "../config/constants.js";
import { recordAudit } from "./audit.service.js";
import { KIND_USER, toSafeUser } from "./auth.service.js";
import {
  issueChallenge,
  consumeChallenge,
} from "./liveness-challenge.service.js";
import { getEnrollmentVerifier } from "./liveness/liveness-verifier.js";

const hasEnrollment = (user) => Boolean(user.faceScanEnc || user.faceScan);

/** Challenge mode tag: keeps an enrollment challenge from ever driving a
 * check-in (and vice versa) even though both use the same token format. */
const ENROLL_MODE = "enroll";

/**
 * Step 1 of enrollment: a randomized liveness challenge, exactly like check-in.
 * Refused when a template already exists, so the expensive capture is never
 * started for a user who would be rejected at the end.
 */
export async function prepareEnrollmentChallenge(userId) {
  const user = await prisma.user.findFirst({ where: { id: userId } });

  if (!user) {
    throw new NotFoundError("User not found.");
  }

  if (hasEnrollment(user)) {
    throw new ConflictError(
      "User face scan already exists. Contact an admin to reset your face scan before updating."
    );
  }

  return issueChallenge({ userId, eventId: null, mode: ENROLL_MODE });
}

/**
 * Step 2: one-time enrollment FROM IMAGES. The server runs the face engine
 * over the uploaded frames, proves the challenge actions were performed live,
 * and derives the template itself.
 *
 * The descriptor used to arrive as a JSON array computed in the browser, so
 * the server never saw a face at the moment identity was established and a
 * template built from a photograph of somebody else was indistinguishable from
 * a real enrollment. Everything downstream (matching, evidence, anomalies)
 * trusts this template, so it has to be produced server-side.
 */
export async function enrollFaceScan(
  userId,
  { frameBuffers, consent, challengeToken, ip } = {}
) {
  const user = await prisma.user.findFirst({ where: { id: userId } });

  if (!user) {
    throw new NotFoundError("User not found.");
  }

  if (consent !== true) {
    throw new BadRequestError(
      "Biometric consent is required before enrolling your face."
    );
  }

  if (hasEnrollment(user)) {
    throw new ConflictError(
      "User face scan already exists. Contact an admin to reset your face scan before updating."
    );
  }

  // Single-use: a replayed token cannot re-drive an enrollment.
  const { actions } = await consumeChallenge({
    token: challengeToken,
    userId,
    eventId: null,
    mode: ENROLL_MODE,
  });

  const verdict = await getEnrollmentVerifier().enroll({
    frameBuffers,
    actions,
    userId,
  });

  if (!verdict.passed || !isFaceDescriptor(verdict.descriptor)) {
    await recordAudit({
      actorKind: "USER",
      actorId: userId,
      action: "FACE_ENROLL_FAILED",
      targetType: "User",
      targetId: userId,
      metadata: {
        reasons: verdict.reasons,
        failedActions: verdict.failedActions,
      },
      ip,
    });

    throw new BadRequestError(
      "We could not verify a live face in that capture. Please follow the prompts in order and try again.",
      { reasons: verdict.reasons, failedActions: verdict.failedActions }
    );
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      faceScanEnc: encryptTemplate(verdict.descriptor),
      faceScan: null,
      biometricConsentAt: new Date(),
      biometricConsentVersion: BIOMETRIC_CONSENT_VERSION,
      faceLastUsedAt: new Date(),
    },
  });

  await recordAudit({
    actorKind: "USER",
    actorId: userId,
    action: "FACE_ENROLL",
    targetType: "User",
    targetId: userId,
    metadata: { consentVersion: BIOMETRIC_CONSENT_VERSION },
    ip,
  });

  // Return the refreshed safe user (hasFaceScan now true) so the client can
  // update its cached session and stop offering enrollment. The descriptor
  // itself is collapsed to the boolean by toSafeUser and never leaves.
  return { user: toSafeUser(KIND_USER, updated) };
}

/** Owner-or-admin enrollment status; 404 when nothing is enrolled. */
export async function getFaceScanStatus(actor, targetUserId) {
  assertSelfOrAdmin(
    actor,
    targetUserId,
    "Only admins can access other users' face scans."
  );

  const user = await prisma.user.findFirst({ where: { id: targetUserId } });

  if (!user) {
    throw new NotFoundError("User not found.");
  }

  if (!hasEnrollment(user)) {
    throw new NotFoundError("No face scan data found for the user.");
  }

  return { hasFaceScan: true };
}

/** Admin reset: destroys the enrolled template so the user can re-enroll. */
export async function deleteFaceScan(targetUserId, { actor, ip } = {}) {
  const user = await prisma.user.findFirst({ where: { id: targetUserId } });

  if (!user) {
    throw new NotFoundError("User not found.");
  }

  if (!hasEnrollment(user)) {
    throw new NotFoundError(
      `No face scan data found for user with ID ${targetUserId}.`
    );
  }

  await prisma.user.update({
    where: { id: targetUserId },
    data: {
      faceScan: null,
      faceScanEnc: null,
      biometricConsentAt: null,
      biometricConsentVersion: null,
      faceLastUsedAt: null,
    },
  });

  await recordAudit({
    actorKind: actor?.kind ?? "ADMIN",
    actorId: actor ? parseInt(actor.id) : null,
    action: "FACE_RESET",
    targetType: "User",
    targetId: targetUserId,
    ip,
  });
}

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

const hasEnrollment = (user) => Boolean(user.faceScanEnc || user.faceScan);

/**
 * One-time enrollment. Requires consent and a valid 128-float descriptor;
 * stores the template encrypted. An existing scan must be admin-reset first.
 */
export async function addFaceScan(userId, faceScan, { consent, ip } = {}) {
  const user = await prisma.user.findFirst({ where: { id: userId } });

  if (!user) {
    throw new NotFoundError("User not found.");
  }

  if (consent !== true) {
    throw new BadRequestError(
      "Biometric consent is required before enrolling your face."
    );
  }

  if (!isFaceDescriptor(faceScan)) {
    throw new BadRequestError("A valid face descriptor is required.");
  }

  if (hasEnrollment(user)) {
    throw new ConflictError(
      "User face scan already exists. Contact an admin to reset your face scan before updating."
    );
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      faceScanEnc: encryptTemplate(faceScan),
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

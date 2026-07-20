// src/services/user.service.js
//
// USER (attendant) account mutations. The account primitives shared with the
// admin side - uniqueness checks, profile edit, picture swap, password change
// - live in principal-account.service.js; this file adds only the rules unique
// to attendants: passwordless creation, biometric destruction on deletion, and
// the owner-or-admin gate. Controllers stay HTTP-only.
import { prisma } from "../config/prisma-client.js";
import { NotFoundError } from "../middleware/error-handler.js";
import { assertSelfOrAdmin } from "../utils/authorization.js";
import {
  invalidateRevokedSessionsCache,
  revokeAllSessions,
  toSafeUser,
} from "./auth.service.js";
import {
  PRINCIPAL_SELECT,
  assertEmailAvailable,
  assertPhoneAvailable,
  changePassword as changePrincipalPassword,
  updateProfile,
  updateProfilePicture as updatePrincipalProfilePicture,
} from "./principal-account.service.js";

/**
 * The public user projection, re-exported for the query service. faceScan and
 * the hash are selected only so toSafeUser can collapse them to booleans; the
 * raw values never leave the server.
 */
export const USER_SELECT = PRINCIPAL_SELECT.USER;

/** Admin-only: creates a passwordless ATTENDANT account. */
export async function createUser({ firstName, lastName, email, phone }) {
  await assertEmailAvailable(email, { kind: "USER" });
  if (phone) {
    await assertPhoneAvailable(phone, { kind: "USER" });
  }

  // Passwordless by design: attendants sign in with a one-time code and may
  // set a password themselves later (password-reset flow).
  const newUser = await prisma.user.create({
    data: { firstName, lastName, email, phone: phone || null },
    select: USER_SELECT,
  });

  return toSafeUser("USER", newUser);
}

/** Owner-or-admin profile update (name/email/phone). */
export async function updateUserProfile(actor, targetUserId, details) {
  assertSelfOrAdmin(
    actor,
    targetUserId,
    "Only admins can update other users' profiles."
  );
  return updateProfile({ kind: "USER", targetId: targetUserId, details });
}

/**
 * Soft delete + full session revocation: the account disappears from every
 * read, its refresh tokens die, and the epoch bump invalidates any access
 * token still in flight. Attendance history survives for reports.
 */
export async function softDeleteUser(actor, targetUserId) {
  // findFirst so the soft-delete scope applies: an already-deleted account
  // reads as not found instead of being deleted twice.
  const user = await prisma.user.findFirst({ where: { id: targetUserId } });

  if (!user) {
    throw new NotFoundError("User not found.");
  }

  // Destroy biometric data on deletion (right-to-be-forgotten): a removed
  // account must not leave an enrolled template or consent record behind.
  // Interactive transaction (revokeAllSessions runs its own statements): the
  // deletion and the session purge commit or roll back as one, so a crash
  // cannot leave a "deleted" account whose sessions still work.
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: targetUserId },
      data: {
        deletedAt: new Date(),
        faceScan: null,
        faceScanEnc: null,
        biometricConsentAt: null,
        biometricConsentVersion: null,
        faceLastUsedAt: null,
      },
    });
    await revokeAllSessions("USER", targetUserId, tx);
  });

  // AFTER the commit, never inside it: an invalidation mid-transaction lets a
  // concurrent request repopulate the cache from the uncommitted old epoch and
  // keep the deleted account's access tokens alive for the full 60s TTL.
  invalidateRevokedSessionsCache("USER", targetUserId);
}

/**
 * Sets or changes the user's password, then revokes all sessions. Attendants
 * may be passwordless (OTP-only), so a first password is set with no current
 * one; an account that already has a password must supply the correct current.
 */
export async function changePassword(userId, currentPassword, newPassword) {
  return changePrincipalPassword({
    kind: "USER",
    id: userId,
    currentPassword,
    newPassword,
    allowPasswordless: true,
  });
}

/** Owner-or-admin profile picture replacement. */
export async function updateProfilePicture(actor, targetUserId, file) {
  assertSelfOrAdmin(
    actor,
    targetUserId,
    "Only admins can update other users' profile pictures."
  );
  return updatePrincipalProfilePicture({
    kind: "USER",
    targetId: targetUserId,
    file,
  });
}

// src/services/user.service.js
//
// User account mutations: creation, profile/role updates, soft deletion,
// password change, and profile pictures. Controllers stay HTTP-only; the
// domain rules (conflict checks, owner-or-admin gates, session revocation
// on sensitive changes) live here.
import bcrypt from "bcrypt";
import { prisma } from "../config/prisma-client.js";
import { BCRYPT_SALT_ROUNDS } from "../config/constants.js";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "../middleware/error-handler.js";
import { deleteImage, uploadImage } from "../utils/cloudinary.js";
import { assertSelfOrAdmin } from "../utils/authorization.js";
import {
  invalidateRevokedSessionsCache,
  revokeAllSessions,
  toSafeUser,
} from "./auth.service.js";

/**
 * The public user projection. faceScan is selected only so toSafeUser can
 * collapse it to hasFaceScan - the raw descriptor never leaves the server.
 */
export const USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  profilePicture: true,
  phone: true,
  // Selected only so toSafeUser can collapse to a boolean; the hash itself is
  // stripped before the DTO leaves the service.
  password: true,
  // Both enrollment columns are selected only so toSafeUser can collapse them
  // to hasFaceScan - neither the descriptor nor its ciphertext ever leaves.
  faceScan: true,
  faceScanEnc: true,
  twoFactorEnabled: true,
  phoneVerified: true,
  createdAt: true,
  updatedAt: true,
};

// Uniqueness checks stay on findUnique ON PURPOSE: they bypass the
// soft-delete scope, so a soft-deleted account still blocks reuse of its
// email/phone.
async function assertEmailAvailable(email, excludeUserId) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.id !== excludeUserId) {
    throw new ConflictError("A user with this email already exists.");
  }
  // Emails are login identifiers across BOTH principal tables - an
  // attendant sharing an admin's email would make login ambiguous.
  const adminExisting = await prisma.admin.findUnique({ where: { email } });
  if (adminExisting) {
    throw new ConflictError("A user with this email already exists.");
  }
}

async function assertPhoneAvailable(phone, excludeUserId) {
  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing && existing.id !== excludeUserId) {
    throw new ConflictError("A user with this phone number already exists.");
  }
}

/** Admin-only: creates an ATTENDANT account. */
export async function createUser({
  firstName,
  lastName,
  email,
  phone,
}) {
  await assertEmailAvailable(email);
  if (phone) {
    await assertPhoneAvailable(phone);
  }

  // Passwordless by design: attendants sign in with a one-time code and
  // may set a password themselves later (password-reset flow).
  const newUser = await prisma.user.create({
    data: {
      firstName,
      lastName,
      email,
      phone: phone || null,
    },
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

  // findFirst: a soft-deleted account reads as absent.
  const existingUser = await prisma.user.findFirst({
    where: { id: targetUserId },
    select: { profilePicture: true, email: true, phone: true },
  });

  if (!existingUser) {
    throw new NotFoundError("User not found.");
  }

  if (details.email && details.email !== existingUser.email) {
    await assertEmailAvailable(details.email, targetUserId);
  }

  if (details.phone && details.phone !== existingUser.phone) {
    await assertPhoneAvailable(details.phone, targetUserId);
  }

  const updateData = {};
  if (details.firstName !== undefined) updateData.firstName = details.firstName;
  if (details.lastName !== undefined) updateData.lastName = details.lastName;
  if (details.email !== undefined) updateData.email = details.email;
  if (details.phone !== undefined) updateData.phone = details.phone;

  const updatedUser = await prisma.user.update({
    where: { id: targetUserId },
    data: updateData,
    select: USER_SELECT,
  });

  return toSafeUser("USER", updatedUser);
}

/**
 * Soft delete + full session revocation: the account disappears from every
 * read, its refresh tokens die, and the epoch bump invalidates any access
 * token still in flight. Attendance history survives for reports.
 */
export async function softDeleteUser(actor, targetUserId) {
  // findFirst so the soft-delete scope applies: an already-deleted account
  // reads as not found instead of being deleted twice.
  const user = await prisma.user.findFirst({
    where: { id: targetUserId },
  });

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
 * Sets or changes the user's password, then revokes all sessions.
 * - Passwordless (OTP-only) accounts SET a first password with no current one.
 * - Accounts that already have a password MUST supply the correct current one;
 *   this is enforced here regardless of what the client sends.
 */
export async function changePassword(userId, currentPassword, newPassword) {
  const user = await prisma.user.findFirst({
    where: { id: userId },
    select: { password: true },
  });

  if (!user) {
    throw new NotFoundError("User not found");
  }

  if (user.password) {
    if (!currentPassword) {
      throw new BadRequestError(
        "Your current password is required to change it."
      );
    }
    if (currentPassword === newPassword) {
      throw new BadRequestError(
        "New password cannot be the same as current password"
      );
    }
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      throw new BadRequestError("Current password is incorrect");
    }
  }
  // Passwordless: fall through and set the first password directly.

  const hashedNewPassword = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);

  await prisma.user.update({
    where: { id: userId },
    data: { password: hashedNewPassword },
  });

  // A changed password revokes every outstanding session - if it changed
  // because of compromise, the attacker's tokens die with it.
  await revokeAllSessions("USER", userId);
}

/**
 * Owner-or-admin profile picture replacement: destroys the previous
 * Cloudinary asset (best effort), uploads the new one, stores the URL.
 */
export async function updateProfilePicture(actor, targetUserId, file) {
  assertSelfOrAdmin(
    actor,
    targetUserId,
    "Only admins can update other users' profile pictures."
  );

  if (!file) {
    throw new BadRequestError("Profile picture file is required.");
  }

  const user = await prisma.user.findFirst({
    where: { id: targetUserId },
    select: { profilePicture: true },
  });

  if (!user) {
    throw new NotFoundError("User not found.");
  }

  // Upload the new asset FIRST (so a failed upload never orphans the account
  // without a picture), then swap the row. The old asset is cleaned up off the
  // response path - deleteImage is best-effort and swallows its own errors.
  const oldPicture = user.profilePicture;
  const secureUrl = await uploadImage(file.buffer);

  const updatedUser = await prisma.user.update({
    where: { id: targetUserId },
    data: {
      profilePicture: secureUrl,
    },
    select: USER_SELECT,
  });

  if (oldPicture) void deleteImage(oldPicture);

  return toSafeUser("USER", updatedUser);
}

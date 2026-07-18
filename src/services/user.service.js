// src/services/user.service.js
//
// User account mutations: creation, profile/role updates, soft deletion,
// password change, and profile pictures. Controllers stay HTTP-only; the
// domain rules (conflict checks, owner-or-admin gates, session revocation
// on sensitive changes) live here.
import bcrypt from "bcrypt";
import cloudinary from "cloudinary";
import { prisma } from "../config/prisma-client.js";
import { BCRYPT_SALT_ROUNDS } from "../config/constants.js";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../middleware/error-handler.js";
import { extractPublicIdFromUrl } from "../utils/extractPublicIdFromUrl.js";
import { assertSelfOrAdmin } from "../utils/authorization.js";
import { revokeAllSessions, toSafeUser } from "./auth.service.js";

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
  faceScan: true,
  role: true,
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
}

async function assertPhoneAvailable(phone, excludeUserId) {
  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing && existing.id !== excludeUserId) {
    throw new ConflictError("A user with this phone number already exists.");
  }
}

/** Admin-only: creates an account and returns the safe user shape. */
export async function createUser({
  firstName,
  lastName,
  email,
  password,
  phone,
  role,
}) {
  await assertEmailAvailable(email);
  if (phone) {
    await assertPhoneAvailable(phone);
  }

  const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

  const newUser = await prisma.user.create({
    data: {
      firstName,
      lastName,
      email,
      password: hashedPassword,
      phone: phone || null,
      role: role || "USER",
    },
    select: USER_SELECT,
  });

  return toSafeUser(newUser);
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

  return toSafeUser(updatedUser);
}

/** Admin-only role change; admins cannot change their own role. */
export async function updateUserRole(actor, targetUserId, role) {
  if (!["ADMIN", "USER"].includes(role)) {
    throw new ValidationError("Invalid role. Must be ADMIN or USER.");
  }

  if (parseInt(actor?.id?.toString() || "0") === targetUserId) {
    throw new ForbiddenError("You cannot update your own role.");
  }

  const user = await prisma.user.findFirst({ where: { id: targetUserId } });

  if (!user) {
    throw new NotFoundError("User not found.");
  }

  if (user.role === role) {
    throw new BadRequestError(`User already has the role: ${role}`);
  }

  const updatedUser = await prisma.user.update({
    where: { id: targetUserId },
    data: { role },
    select: USER_SELECT,
  });

  return toSafeUser(updatedUser);
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

  if (targetUserId === parseInt(actor?.id?.toString() || "0")) {
    if (user.role === "ADMIN") {
      throw new ForbiddenError("Admins cannot delete themselves");
    }
  }

  await prisma.user.update({
    where: { id: targetUserId },
    data: { deletedAt: new Date() },
  });
  await revokeAllSessions(targetUserId);
}

/** Verifies the current password, sets the new one, revokes all sessions. */
export async function changePassword(userId, currentPassword, newPassword) {
  if (currentPassword === newPassword) {
    throw new BadRequestError(
      "New password cannot be the same as current password"
    );
  }

  const user = await prisma.user.findFirst({
    where: { id: userId },
    select: { password: true },
  });

  if (!user) {
    throw new NotFoundError("User not found");
  }

  const isMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isMatch) {
    throw new BadRequestError("Current password is incorrect");
  }

  const hashedNewPassword = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);

  await prisma.user.update({
    where: { id: userId },
    data: { password: hashedNewPassword },
  });

  // A changed password revokes every outstanding session - if it changed
  // because of compromise, the attacker's tokens die with it.
  await revokeAllSessions(userId);
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

  if (user.profilePicture) {
    try {
      const publicId = extractPublicIdFromUrl(user.profilePicture);
      await cloudinary.v2.uploader.destroy(publicId);
    } catch (error) {
      console.error("Error deleting old profile picture:", error);
    }
  }

  const uploadResult = await new Promise((resolve, reject) => {
    const uploadStream = cloudinary.v2.uploader.upload_stream(
      {
        folder: "bethere",
        quality: "auto",
        fetch_format: "auto",
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    uploadStream.end(file.buffer);
  });

  const updatedUser = await prisma.user.update({
    where: { id: targetUserId },
    data: {
      profilePicture: uploadResult.secure_url,
    },
    select: USER_SELECT,
  });

  return toSafeUser(updatedUser);
}

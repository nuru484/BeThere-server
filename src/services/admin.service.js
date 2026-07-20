// src/services/admin.service.js
//
// Staff account management (Admin table). Admins are created by other
// admins (or the seed); they carry no attendance or biometrics.
import bcrypt from "bcrypt";
import { prisma } from "../config/prisma-client.js";
import { BCRYPT_SALT_ROUNDS } from "../config/constants.js";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../middleware/error-handler.js";
import { deleteImage, uploadImage } from "../utils/cloudinary.js";
import { assertSelfAdmin } from "../utils/authorization.js";
import { revokeAllSessions, toSafeUser } from "./auth.service.js";

/** The public admin projection - the Admin twin of USER_SELECT. */
export const ADMIN_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  profilePicture: true,
  phone: true,
  twoFactorEnabled: true,
  createdAt: true,
  updatedAt: true,
};

async function assertAdminEmailAvailable(email, excludeAdminId) {
  // findUnique on purpose: soft-deleted rows still block reuse, and the
  // email must be unique across BOTH principal tables (login resolves
  // admins first, so a duplicate would shadow the attendant).
  const [admin, user] = await Promise.all([
    prisma.admin.findUnique({ where: { email } }),
    prisma.user.findUnique({ where: { email } }),
  ]);
  if ((admin && admin.id !== excludeAdminId) || user) {
    throw new ConflictError("An account with this email already exists.");
  }
}

async function assertAdminPhoneAvailable(phone, excludeAdminId) {
  // findUnique on purpose: a soft-deleted admin still blocks phone reuse.
  const existing = await prisma.admin.findUnique({ where: { phone } });
  if (existing && existing.id !== excludeAdminId) {
    throw new ConflictError("An admin with this phone number already exists.");
  }
}

export async function createAdmin({ firstName, lastName, email, password, phone }) {
  if (!password) {
    throw new BadRequestError("A password is required to create an admin.");
  }
  await assertAdminEmailAvailable(email);

  const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

  const admin = await prisma.admin.create({
    data: {
      firstName,
      lastName,
      email,
      password: hashedPassword,
      phone: phone || null,
    },
  });

  return toSafeUser("ADMIN", admin);
}

export async function listAdmins({ skip, limit }) {
  const [admins, total] = await Promise.all([
    prisma.admin.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.admin.count(),
  ]);
  return { admins: admins.map((a) => toSafeUser("ADMIN", a)), total };
}

/**
 * Single admin fetch, ADMIN-kind actors only (route-gated). Answers in the
 * same safe shape as GET /users/:userId so the client can switch endpoints
 * by role transparently.
 */
export async function getAdminById(targetAdminId) {
  // findFirst: a soft-deleted admin reads as absent.
  const admin = await prisma.admin.findFirst({
    where: { id: targetAdminId },
    select: ADMIN_SELECT,
  });

  if (!admin) {
    throw new NotFoundError("Admin not found.");
  }

  return toSafeUser("ADMIN", admin);
}

/** Self-only profile update (name/email/phone) - the Admin twin of
 * updateUserProfile. */
export async function updateAdminProfile(actor, targetAdminId, details) {
  assertSelfAdmin(
    actor,
    targetAdminId,
    "Admins can only update their own profile."
  );

  const existingAdmin = await prisma.admin.findFirst({
    where: { id: targetAdminId },
    select: { email: true, phone: true },
  });

  if (!existingAdmin) {
    throw new NotFoundError("Admin not found.");
  }

  if (details.email && details.email !== existingAdmin.email) {
    await assertAdminEmailAvailable(details.email, targetAdminId);
  }

  if (details.phone && details.phone !== existingAdmin.phone) {
    await assertAdminPhoneAvailable(details.phone, targetAdminId);
  }

  const updateData = {};
  if (details.firstName !== undefined) updateData.firstName = details.firstName;
  if (details.lastName !== undefined) updateData.lastName = details.lastName;
  if (details.email !== undefined) updateData.email = details.email;
  if (details.phone !== undefined) updateData.phone = details.phone;

  const updatedAdmin = await prisma.admin.update({
    where: { id: targetAdminId },
    data: updateData,
    select: ADMIN_SELECT,
  });

  return toSafeUser("ADMIN", updatedAdmin);
}

/**
 * Self-only profile picture replacement: destroys the previous Cloudinary
 * asset (best effort), uploads the new one, stores the URL - the Admin twin
 * of updateProfilePicture.
 */
export async function updateAdminProfilePicture(actor, targetAdminId, file) {
  assertSelfAdmin(
    actor,
    targetAdminId,
    "Admins can only update their own profile picture."
  );

  if (!file) {
    throw new BadRequestError("Profile picture file is required.");
  }

  const admin = await prisma.admin.findFirst({
    where: { id: targetAdminId },
    select: { profilePicture: true },
  });

  if (!admin) {
    throw new NotFoundError("Admin not found.");
  }

  // Upload first, then swap the row; clean up the old asset off the response
  // path (best-effort, swallows its own errors).
  const oldPicture = admin.profilePicture;
  const secureUrl = await uploadImage(file.buffer);

  const updatedAdmin = await prisma.admin.update({
    where: { id: targetAdminId },
    data: { profilePicture: secureUrl },
    select: ADMIN_SELECT,
  });

  if (oldPicture) void deleteImage(oldPicture);

  return toSafeUser("ADMIN", updatedAdmin);
}

/** Soft delete + full session revocation. Admins cannot delete themselves. */
export async function deleteAdmin(actor, targetAdminId) {
  if (actor.kind === "ADMIN" && parseInt(actor.id) === targetAdminId) {
    throw new ForbiddenError("Admins cannot delete themselves");
  }

  const admin = await prisma.admin.findFirst({ where: { id: targetAdminId } });
  if (!admin) {
    throw new NotFoundError("Admin not found.");
  }

  // Never delete the last remaining admin - that would lock the org out with
  // no way back (admin creation is itself an admin-only action).
  const remainingAdmins = await prisma.admin.count();
  if (remainingAdmins <= 1) {
    throw new ForbiddenError(
      "Cannot delete the last admin. Create another admin first."
    );
  }

  await prisma.admin.update({
    where: { id: targetAdminId },
    data: { deletedAt: new Date() },
  });
  await revokeAllSessions("ADMIN", targetAdminId);
}

/** Verifies the current password, sets the new one, revokes all sessions. */
export async function changeAdminPassword(adminId, currentPassword, newPassword) {
  // Admins always have a password, so a missing current one is a clean 400,
  // never a bcrypt.compare(undefined) crash.
  if (!currentPassword) {
    throw new BadRequestError("Current password is required.");
  }
  if (currentPassword === newPassword) {
    throw new BadRequestError(
      "New password cannot be the same as current password"
    );
  }

  const admin = await prisma.admin.findFirst({
    where: { id: adminId },
    select: { password: true },
  });
  if (!admin) {
    throw new NotFoundError("Admin not found");
  }

  const isMatch = await bcrypt.compare(currentPassword, admin.password);
  if (!isMatch) {
    throw new BadRequestError("Current password is incorrect");
  }

  const hashed = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
  await prisma.admin.update({
    where: { id: adminId },
    data: { password: hashed },
  });

  await revokeAllSessions("ADMIN", adminId);
}

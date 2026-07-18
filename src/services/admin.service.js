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
import { revokeAllSessions, toSafeUser } from "./auth.service.js";

async function assertAdminEmailAvailable(email) {
  // findUnique on purpose: soft-deleted rows still block reuse, and the
  // email must be unique across BOTH principal tables (login resolves
  // admins first, so a duplicate would shadow the attendant).
  const [admin, user] = await Promise.all([
    prisma.admin.findUnique({ where: { email } }),
    prisma.user.findUnique({ where: { email } }),
  ]);
  if (admin || user) {
    throw new ConflictError("An account with this email already exists.");
  }
}

export async function createAdmin({ firstName, lastName, email, password, phone }) {
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

/** Soft delete + full session revocation. Admins cannot delete themselves. */
export async function deleteAdmin(actor, targetAdminId) {
  if (actor.kind === "ADMIN" && parseInt(actor.id) === targetAdminId) {
    throw new ForbiddenError("Admins cannot delete themselves");
  }

  const admin = await prisma.admin.findFirst({ where: { id: targetAdminId } });
  if (!admin) {
    throw new NotFoundError("Admin not found.");
  }

  await prisma.admin.update({
    where: { id: targetAdminId },
    data: { deletedAt: new Date() },
  });
  await revokeAllSessions("ADMIN", targetAdminId);
}

/** Verifies the current password, sets the new one, revokes all sessions. */
export async function changeAdminPassword(adminId, currentPassword, newPassword) {
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

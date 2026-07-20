// src/services/admin.service.js
//
// ADMIN (staff) account management. The account primitives shared with the
// attendant side - uniqueness checks, profile edit, picture swap, password
// change - live in principal-account.service.js; this file adds only what is
// admin-specific: password-required creation, listing, the self-only gate, and
// the guards that stop an admin deleting themselves or the last admin.
import bcrypt from "bcrypt";
import { prisma } from "../config/prisma-client.js";
import { BCRYPT_SALT_ROUNDS } from "../config/constants.js";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "../middleware/error-handler.js";
import { assertSelfAdmin } from "../utils/authorization.js";
import { revokeAllSessions, toSafeUser } from "./auth.service.js";
import {
  PRINCIPAL_SELECT,
  assertEmailAvailable,
  changePassword as changePrincipalPassword,
  updateProfile,
  updateProfilePicture as updatePrincipalProfilePicture,
} from "./principal-account.service.js";

/** The public admin projection. */
export const ADMIN_SELECT = PRINCIPAL_SELECT.ADMIN;

export async function createAdmin({ firstName, lastName, email, password, phone }) {
  if (!password) {
    throw new BadRequestError("A password is required to create an admin.");
  }
  await assertEmailAvailable(email, { kind: "ADMIN" });

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

/** Self-only profile update (name/email/phone). */
export async function updateAdminProfile(actor, targetAdminId, details) {
  assertSelfAdmin(
    actor,
    targetAdminId,
    "Admins can only update their own profile."
  );
  return updateProfile({ kind: "ADMIN", targetId: targetAdminId, details });
}

/** Self-only profile picture replacement. */
export async function updateAdminProfilePicture(actor, targetAdminId, file) {
  assertSelfAdmin(
    actor,
    targetAdminId,
    "Admins can only update their own profile picture."
  );
  return updatePrincipalProfilePicture({
    kind: "ADMIN",
    targetId: targetAdminId,
    file,
  });
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
  return changePrincipalPassword({
    kind: "ADMIN",
    id: adminId,
    currentPassword,
    newPassword,
    allowPasswordless: false,
  });
}

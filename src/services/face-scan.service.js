// src/services/face-scan.service.js
//
// Face descriptor enrollment lifecycle: one-time self enrollment, an
// enrollment-status read (the raw descriptor stays server-only:
// verification happens on the server at check-in, so no client flow ever
// needs the enrolled descriptor back), and the admin reset.
import { prisma } from "../config/prisma-client.js";
import {
  ConflictError,
  NotFoundError,
} from "../middleware/error-handler.js";
import { assertSelfOrAdmin } from "../utils/authorization.js";
import { USER_SELECT } from "./user.service.js";

/** One-time enrollment; an existing scan must be reset by an admin first. */
export async function addFaceScan(userId, faceScan) {
  const user = await prisma.user.findFirst({ where: { id: userId } });

  if (!user) {
    throw new NotFoundError("User not found.");
  }

  if (user.faceScan) {
    throw new ConflictError(
      "User face scan already exists. Contact an admin to reset your face scan before updating."
    );
  }

  return prisma.user.update({
    where: { id: userId },
    data: { faceScan },
    select: USER_SELECT,
  });
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

  if (!user.faceScan) {
    throw new NotFoundError("No face scan data found for the user.");
  }

  return { hasFaceScan: true };
}

/** Admin reset: clears the enrolled descriptor so the user can re-enroll. */
export async function deleteFaceScan(targetUserId) {
  const user = await prisma.user.findFirst({ where: { id: targetUserId } });

  if (!user) {
    throw new NotFoundError("User not found.");
  }

  if (!user.faceScan) {
    throw new NotFoundError(
      `No face scan data found for user with ID ${targetUserId}.`
    );
  }

  await prisma.user.update({
    where: { id: targetUserId },
    data: { faceScan: null },
  });
}

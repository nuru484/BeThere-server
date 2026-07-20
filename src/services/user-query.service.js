// src/services/user-query.service.js
//
// User reads: single profile fetch (owner-or-admin) and the admin list with a
// search filter. Both answer in the safe user shape. There is no role filter:
// every row in this table is an attendant (staff live in the Admin table).
import { prisma } from "../config/prisma-client.js";
import { NotFoundError } from "../middleware/error-handler.js";
import { assertSelfOrAdmin } from "../utils/authorization.js";
import { parseSearchFilter } from "./attendance-query.service.js";
import { toSafeUser } from "./auth.service.js";
import { USER_SELECT } from "./user.service.js";

/** Owner-or-admin single-user fetch; soft-deleted accounts read as absent. */
export async function getUserById(actor, targetUserId) {
  assertSelfOrAdmin(
    actor,
    targetUserId,
    "Only admins can access other users' profiles."
  );

  const user = await prisma.user.findFirst({
    where: { id: targetUserId },
    select: USER_SELECT,
  });

  if (!user) {
    throw new NotFoundError("User not found.");
  }

  return toSafeUser("USER", user);
}

/** Admin list of attendants with name/email/phone search. */
export async function listUsers({ skip, limit, search: rawSearch }) {
  const whereClause = {};

  // Coerced like every other list surface: `?search[]=x` arrives as an array
  // and must 400 as a bad filter, never reach Prisma as a non-string.
  const search = parseSearchFilter(rawSearch);
  if (search) {
    whereClause.OR = [
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { phone: { contains: search, mode: "insensitive" } },
    ];
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where: whereClause,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: USER_SELECT,
    }),
    prisma.user.count({ where: whereClause }),
  ]);

  // The raw 128-float biometric descriptor never leaves the server in bulk
  // responses - clients only need to know whether a face is enrolled.
  return { users: users.map((u) => toSafeUser("USER", u)), total };
}

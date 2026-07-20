// src/utils/principal.js
//
// Principal-kind helpers shared by the auth service, facade, and JWT
// middleware. Admins and attendants live in separate tables with overlapping
// ids, so anything keyed by a principal picks its table through here.
import { prisma } from "../config/prisma-client.js";

/** The Prisma delegate for a principal kind ("ADMIN" | "USER"). Accepts a
 * transaction client so callers can stay atomic. */
export const tableFor = (kind, db = prisma) =>
  kind === "ADMIN" ? db.admin : db.user;

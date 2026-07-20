// src/config/prisma-client.js
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { softDeleteExtension } from "./soft-delete-extension.js";

const connectionString = `${process.env.DATABASE_URL}`;

const adapter = new PrismaPg({ connectionString });

// Reads on soft-deletable models (User, Event) are auto-scoped to
// non-deleted rows by the extension; `findUnique` is the deliberate
// "find deleted on purpose" seam.
//
// Global omit: the event venue secret (which mints the rotating presence
// codes) is stripped from EVERY query result - including events nested inside
// attendance/dashboard responses - so it can never leak to a client. The few
// server-side call sites that genuinely need it override with an explicit
// `select: { venueSecret: true }`.
const prisma = new PrismaClient({
  adapter,
  omit: { event: { venueSecret: true } },
}).$extends(softDeleteExtension);

export { prisma };

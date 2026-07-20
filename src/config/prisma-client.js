// src/config/prisma-client.js
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import ENV from "./env.js";
import { softDeleteExtension } from "./soft-delete-extension.js";

// Through ENV like every other variable: a missing DATABASE_URL dies at boot
// with the variable named, instead of an opaque connection error to the
// literal string "undefined".
const adapter = new PrismaPg({ connectionString: ENV.DATABASE_URL });

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

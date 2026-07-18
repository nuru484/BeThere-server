// src/config/prisma-client.js
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { softDeleteExtension } from "./soft-delete-extension.js";

const connectionString = `${process.env.DATABASE_URL}`;

const adapter = new PrismaPg({ connectionString });

// Reads on soft-deletable models (User, Event) are auto-scoped to
// non-deleted rows by the extension; `findUnique` is the deliberate
// "find deleted on purpose" seam.
const prisma = new PrismaClient({ adapter }).$extends(softDeleteExtension);

export { prisma };

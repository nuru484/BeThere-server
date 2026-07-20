// test/setup.js
//
// Per-file test setup: wipes every table between tests so cases never see
// each other's rows, and disconnects Prisma when the file ends.
import { afterAll, beforeEach } from "vitest";
import { prisma } from "../src/config/prisma-client.js";
import { clearAuthzCache } from "../src/utils/authz-cache.js";

// The table list comes from the database itself (everything in public except
// Prisma's migrations ledger), so a new model is wiped automatically instead
// of silently leaking state into later tests. Discovered once per test file;
// the per-test wipe stays a single TRUNCATE statement.
let truncateStatementPromise;

async function buildTruncateStatement() {
  const tables = await prisma.$queryRawUnsafe(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'"
  );
  const quoted = tables.map((table) => `"${table.tablename}"`).join(", ");
  return `TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`;
}

beforeEach(async () => {
  clearAuthzCache();
  truncateStatementPromise ??= buildTruncateStatement();
  await prisma.$executeRawUnsafe(await truncateStatementPromise);
});

afterAll(async () => {
  await prisma.$disconnect();
});

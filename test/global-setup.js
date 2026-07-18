// test/global-setup.js
//
// Creates the dedicated test database (if missing) and brings it to the
// current migration state. Runs once per vitest invocation, before any test
// worker starts.
import { execFileSync } from "node:child_process";
import pg from "pg";

export default async function globalSetup() {
  const testUrl = process.env.DATABASE_URL;
  if (!testUrl || !new URL(testUrl).pathname.endsWith("bethere_test")) {
    throw new Error(
      "Refusing to run: tests must target the bethere_test database"
    );
  }

  // Connect to the maintenance DB to create bethere_test when absent.
  const adminUrl = new URL(testUrl);
  adminUrl.pathname = "/postgres";
  const client = new pg.Client({ connectionString: adminUrl.toString() });
  await client.connect();
  const exists = await client.query(
    "SELECT 1 FROM pg_database WHERE datname = 'bethere_test'"
  );
  if (exists.rowCount === 0) {
    await client.query('CREATE DATABASE "bethere_test"');
  }
  await client.end();

  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: "inherit",
  });
}

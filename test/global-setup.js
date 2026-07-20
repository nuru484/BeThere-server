// test/global-setup.js
//
// Creates the dedicated test database (if missing) and brings it to the
// current migration state. Runs once per vitest invocation, before any test
// worker starts.
import { execFileSync } from "node:child_process";
import pg from "pg";
import { Redis } from "ioredis";

export default async function globalSetup() {
  const testUrl = process.env.DATABASE_URL;
  if (!testUrl || !new URL(testUrl).pathname.endsWith("bethere_test")) {
    throw new Error(
      "Refusing to run: tests must target the bethere_test database"
    );
  }

  // Fail fast with a readable message when Redis is down: event-creating
  // tests enqueue BullMQ jobs, and without this preflight they hang until
  // the test timeout with an opaque error.
  const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
  const redis = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    connectTimeout: 3000,
    retryStrategy: () => null,
  });
  try {
    await redis.connect();
    await redis.ping();
  } catch (error) {
    throw new Error(
      `Redis is not reachable at ${redisUrl} - the test suite needs a ` +
        `running Redis (BullMQ queues). Start it, or set REDIS_URL. ` +
        `(${error.message})`
    );
  } finally {
    redis.disconnect();
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

// worker.js
//
// Dedicated worker entrypoint (`npm run worker`). When this process is
// deployed, set WEB_DISABLE_WORKERS=true on the web process so jobs are
// never processed twice.
import { prisma } from "./src/config/prisma-client.js";
import { startWorkers, stopWorkers } from "./src/jobs/lifecycle.js";
import { closeRedisClient } from "./src/lib/redis.js";
import { flushSentry, initSentry } from "./src/lib/sentry.js";
import logger from "./src/utils/logger.js";

startWorkers().catch((err) => {
  logger.error(err, "Failed to start worker");
  process.exit(1);
});

initSentry();

let shuttingDown = false;

const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received, shutting down workers...`);

  const forceExit = setTimeout(() => {
    logger.error("Graceful shutdown timed out; forcing exit");
    process.exit(1);
  }, 30_000);
  forceExit.unref();

  try {
    await stopWorkers();
    await closeRedisClient();
    await flushSentry();
    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    logger.error(error, "Error during worker shutdown");
    process.exit(1);
  }
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

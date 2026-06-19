// worker.js
import { sessionWorker } from "./src/jobs/session-worker.js";
import {
  sessionSchedulerQueue,
  scheduleUpcomingSessions,
} from "./src/jobs/session-scheduler.js";
import { tokenCleanupQueue } from "./src/jobs/token-cleanup.js";
import { cleanupExpiredResetTokens } from "./src/services/password-reset.service.js";
import logger from "./src/utils/logger.js";
import { Worker } from "bullmq";
import { createRedisConnection } from "./src/config/redis-connection.js";

logger.info("🚀 Session worker started and listening for jobs...");

// Run the scheduler immediately on startup
scheduleUpcomingSessions().catch(logger.error);

// Schedule the checker to run daily at midnight
sessionSchedulerQueue.add(
  "dailyCheck",
  {},
  {
    repeat: {
      pattern: "0 0 * * *", // Every day at midnight
    },
  }
);

// Worker to handle the scheduled daily checks
const schedulerWorker = new Worker(
  "sessionScheduler",
  async () => {
    await scheduleUpcomingSessions();
  },
  {
    connection: createRedisConnection(),
  }
);

// Schedule expired password-reset-token cleanup daily at 03:00
tokenCleanupQueue.add(
  "dailyCleanup",
  {},
  {
    repeat: {
      pattern: "0 3 * * *",
    },
  }
);

// Worker to remove expired password reset tokens
const tokenCleanupWorker = new Worker(
  "tokenCleanup",
  async () => {
    const count = await cleanupExpiredResetTokens();
    logger.info(`🧹 Cleaned up ${count} expired password reset token(s)`);
  },
  {
    connection: createRedisConnection(),
  }
);

// Graceful shutdown
process.on("SIGINT", async () => {
  logger.info("🛑 Shutting down workers...");
  await sessionWorker.close();
  await schedulerWorker.close();
  await tokenCleanupWorker.close();
  process.exit(0);
});

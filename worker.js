// worker.js
import { sessionWorker } from "./src/jobs/session-worker.js";
import {
  sessionSchedulerQueue,
  scheduleUpcomingSessions,
} from "./src/jobs/session-scheduler.js";
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

// Graceful shutdown
process.on("SIGINT", async () => {
  logger.info("🛑 Shutting down workers...");
  await sessionWorker.close();
  await schedulerWorker.close();
  process.exit(0);
});

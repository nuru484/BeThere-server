// src/jobs/lifecycle.js
//
// Shared BullMQ worker lifecycle for both entrypoints: server.js runs the
// workers in-process by default (single deployment) and worker.js is the
// dedicated worker entry. Imports are lazy so a web process with
// WEB_DISABLE_WORKERS=true never opens a Redis connection for them.
import logger from "../utils/logger.js";

let running = null;

export async function startWorkers() {
  if (running) return running;

  const [{ sessionWorker }, scheduler, { tokenCleanupQueue }, resetService, bullmq, redis] =
    await Promise.all([
      import("./session-worker.js"),
      import("./session-scheduler.js"),
      import("./token-cleanup.js"),
      import("../services/password-reset.service.js"),
      import("bullmq"),
      import("../config/redis-connection.js"),
    ]);

  const { sessionSchedulerQueue, scheduleUpcomingSessions } = scheduler;
  const { Worker } = bullmq;
  const { createRedisConnection } = redis;

  logger.info("🚀 Session worker started and listening for jobs...");

  // Run the scheduler immediately on startup.
  scheduleUpcomingSessions().catch((err) => logger.error(err));

  // Daily checks: session generation at midnight, token cleanup at 03:00.
  await sessionSchedulerQueue.add(
    "dailyCheck",
    {},
    { repeat: { pattern: "0 0 * * *" } }
  );
  await tokenCleanupQueue.add(
    "dailyCleanup",
    {},
    { repeat: { pattern: "0 3 * * *" } }
  );

  const schedulerWorker = new Worker(
    "sessionScheduler",
    async () => {
      await scheduleUpcomingSessions();
    },
    { connection: createRedisConnection() }
  );

  const tokenCleanupWorker = new Worker(
    "tokenCleanup",
    async () => {
      const count = await resetService.cleanupExpiredResetTokens();
      logger.info(`🧹 Cleaned up ${count} expired password reset token(s)`);
    },
    { connection: createRedisConnection() }
  );

  running = {
    workers: [sessionWorker, schedulerWorker, tokenCleanupWorker],
    queues: [sessionSchedulerQueue, tokenCleanupQueue],
  };
  return running;
}

/** Closes every worker (waiting on in-flight jobs) and queue connection. */
export async function stopWorkers() {
  if (!running) return;
  const { workers, queues } = running;
  running = null;
  await Promise.all(workers.map((worker) => worker.close()));
  await Promise.all(queues.map((queue) => queue.close()));
}

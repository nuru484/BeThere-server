// src/jobs/session-finalizer.js
//
// BullMQ queue for the session-finalization sweep (absence marking + auto
// check-out). The repeatable schedule is registered by jobs/lifecycle.js
// with ensureRepeatableJob, like the other cron queues.
import { Queue } from "bullmq";
import { createRedisConnection } from "../config/redis-connection.js";

export const sessionFinalizerQueue = new Queue("sessionFinalizer", {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 30_000 },
    // Every-10-minutes repeats: keep a short bounded trail for debugging
    // instead of accumulating a row per run forever.
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 100 },
  },
});

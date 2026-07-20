// src/jobs/token-cleanup.js
import { Queue } from "bullmq";
import { createRedisConnection } from "../config/redis-connection.js";

// Queue for periodic removal of expired password reset tokens.
// The worker that drains it lives in worker.js (mirrors the session scheduler).
export const tokenCleanupQueue = new Queue("tokenCleanup", {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 30_000 },
    // Daily repeats: keep a short bounded trail for debugging instead of
    // accumulating a row per day forever.
    removeOnComplete: { count: 30 },
    removeOnFail: { count: 100 },
  },
});

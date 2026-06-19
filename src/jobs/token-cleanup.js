// src/jobs/token-cleanup.js
import { Queue } from "bullmq";
import { createRedisConnection } from "../config/redis-connection.js";

// Queue for periodic removal of expired password reset tokens.
// The worker that drains it lives in worker.js (mirrors the session scheduler).
export const tokenCleanupQueue = new Queue("tokenCleanup", {
  connection: createRedisConnection(),
});

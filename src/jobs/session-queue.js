// src/jobs/sessionQueue.js
import { Queue } from "bullmq";
import { createRedisConnection } from "../config/redis-connection.js";

export const sessionQueue = new Queue("sessionQueue", {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: false,
  },
});

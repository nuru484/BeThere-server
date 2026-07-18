// src/lib/redis.js
//
// One shared ioredis client for app-level state visible to every instance:
// rate-limit counters and the authz (tokenVersion) cache. BullMQ keeps its
// own connections. Commands queue briefly while the lazy connection comes
// up (the rate-limit store loads its script at construction), but
// maxRetriesPerRequest:1 keeps rejection bounded when Redis is truly down
// so callers fall back to their in-process alternatives. Tests never open
// a connection.
import { Redis } from "ioredis";
import ENV from "../config/env.js";
import logger from "../utils/logger.js";

let client;

export function getRedisClient() {
  if (client !== undefined) return client;
  if (ENV.NODE_ENV === "test") {
    client = null;
    return client;
  }

  client = new Redis(ENV.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  client.on("error", (err) => {
    logger.warn({ err: err.message }, "Shared Redis client error");
  });
  client.connect().catch(() => undefined);
  return client;
}

/** Graceful-shutdown hook. */
export async function closeRedisClient() {
  if (!client) {
    client = undefined;
    return;
  }
  const current = client;
  client = undefined;
  try {
    await current.quit();
  } catch {
    current.disconnect();
  }
}

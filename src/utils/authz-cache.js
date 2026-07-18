// src/utils/authz-cache.js
//
// Short-TTL cache for the per-request session-epoch read (a principal's
// live tokenVersion). REDIS-FIRST so every instance shares one view: an
// epoch bump deletes the shared entry and applies everywhere at once. When
// Redis is unavailable (tests, a hiccup) it degrades to a per-process map
// with the same TTL rather than failing requests.
//
// Keys are kind:id - admins and attendants live in separate tables with
// overlapping numeric ids.
import { getRedisClient } from "../lib/redis.js";
import logger from "./logger.js";

const TTL_MS = 60_000;
const MAX_ENTRIES = 1000;
/** Redis stores strings: a numeric version, or GONE for "account absent". */
const GONE = "gone";

const memory = new Map();

const cacheKey = (kind, id) => `authz:v:${kind}:${id}`;

const readMemory = (key) => {
  const entry = memory.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    memory.delete(key);
    return undefined;
  }
  return entry.version;
};

const writeMemory = (key, version) => {
  if (memory.size >= MAX_ENTRIES) memory.clear();
  memory.set(key, { expiresAt: Date.now() + TTL_MS, version });
};

/** Returns the cached epoch: a number, null (account known gone), or
 * undefined on a miss/expiry. */
export async function getCachedTokenVersion(kind, id) {
  const key = cacheKey(kind, id);
  const redis = getRedisClient();
  if (redis) {
    try {
      const raw = await redis.get(key);
      if (raw === null) return undefined;
      if (raw === GONE) return null;
      const version = Number(raw);
      return Number.isNaN(version) ? undefined : version;
    } catch {
      // Redis unreachable: the client's error listener already logged it.
    }
  }
  return readMemory(key);
}

export async function setCachedTokenVersion(kind, id, version) {
  const key = cacheKey(kind, id);
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.set(key, version === null ? GONE : String(version), "PX", TTL_MS);
      return;
    } catch {
      // Fall through to the per-process map.
    }
  }
  writeMemory(key, version);
}

/** Drop a principal's cached epoch so revocation applies at once. */
export function invalidateCachedTokenVersion(kind, id) {
  const key = cacheKey(kind, id);
  memory.delete(key);
  const redis = getRedisClient();
  if (redis) {
    redis.del(key).catch((err) => {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), key },
        "Failed to invalidate shared authz cache entry"
      );
    });
  }
}

/** Test seam. */
export function clearAuthzCache() {
  memory.clear();
}

// src/utils/authz-cache.js
//
// Short-TTL in-memory cache for the per-request session-epoch read (the
// user's live tokenVersion), so authenticateJWT does not hit the database on
// every request. Epoch bumps (theft response, password change, deletion)
// invalidate their entry immediately. Single-process deployment; a
// multi-instance future needs a shared store (see traveltrek's Redis-backed
// version for the pattern).

const TTL_MS = 60_000;
const MAX_ENTRIES = 1000;

const cache = new Map();

/** Returns the cached epoch: a number, null (account known gone), or
 * undefined on a miss/expiry. */
export function getCachedTokenVersion(userId) {
  const entry = cache.get(userId);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(userId);
    return undefined;
  }
  return entry.version;
}

export function setCachedTokenVersion(userId, version) {
  if (cache.size >= MAX_ENTRIES) cache.clear();
  cache.set(userId, { expiresAt: Date.now() + TTL_MS, version });
}

/** Drop a user's cached epoch so revocation applies at once. */
export function invalidateCachedTokenVersion(userId) {
  cache.delete(userId);
}

/** Test seam. */
export function clearAuthzCache() {
  cache.clear();
}

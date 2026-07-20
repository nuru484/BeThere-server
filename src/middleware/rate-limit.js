// src/middleware/rate-limit.js
import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { getRedisClient } from "../lib/redis.js";
import ENV from "../config/env.js";

/**
 * Counter store shared across instances: Redis when the shared client
 * exists, express-rate-limit's in-memory default otherwise (tests). Each
 * limiter gets its own prefix so windows never collide on one IP.
 */
const createStore = (prefix) => {
  const client = getRedisClient();
  if (!client) return undefined;
  return new RedisStore({
    prefix,
    sendCommand: (command, ...args) => client.call(command, ...args),
  });
};

// Shared 429 response shape — matches the app's error envelope so the client's
// error extractor reads `message` the same way it does for every other error.
const rateLimitResponse = (message) => ({
  status: "error",
  message,
  code: "RATE_LIMIT_EXCEEDED",
});

/**
 * Limits how often a client can request a password reset email. Tighter, because
 * each call sends an email and is the main abuse/enumeration vector.
 */
export const passwordResetRequestLimiter = rateLimit({
  store: createStore("rl:reset-req:"),
  passOnStoreError: true,
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitResponse(
    "Too many password reset requests. Please try again in a few minutes."
  ),
});

/**
 * Limits token verification / final reset attempts to slow brute-force probing
 * of reset tokens, while staying lenient enough for normal retries.
 */
export const passwordResetConfirmLimiter = rateLimit({
  store: createStore("rl:reset-confirm:"),
  passOnStoreError: true,
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitResponse(
    "Too many attempts. Please try again in a few minutes."
  ),
});

/**
 * Brute-force cap for login: only FAILED attempts count toward the limit, so
 * a legitimate user signing in all day never locks themselves out while a
 * password-guesser hits the wall.
 */
export const loginLimiter = rateLimit({
  store: createStore("rl:login:"),
  passOnStoreError: true,
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => ENV.NODE_ENV === "test",
  message: rateLimitResponse(
    "Too many failed login attempts. Please try again in a few minutes."
  ),
});

/**
 * OTP request/verify surfaces: tight windows because every request sends an
 * SMS or email, and codes are 6 digits.
 */
export const otpRequestLimiter = rateLimit({
  store: createStore("rl:otp-req:"),
  passOnStoreError: true,
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => ENV.NODE_ENV === "test",
  message: rateLimitResponse(
    "Too many code requests. Please try again in a few minutes."
  ),
});

/**
 * Refresh endpoint: a JWT verify + DB lookups per hit and the surface a stolen
 * token would be replayed against. Generous enough for normal 30-min rotation,
 * tight enough to stop rapid probing.
 */
export const refreshTokenLimiter = rateLimit({
  store: createStore("rl:refresh:"),
  passOnStoreError: true,
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => ENV.NODE_ENV === "test",
  message: rateLimitResponse(
    "Too many refresh attempts. Please try again in a few minutes."
  ),
});

/**
 * Demo login: every hit mints a session, so skipSuccessfulRequests would never
 * limit it. Counts all attempts to cap abuse of the open portfolio endpoint.
 */
export const demoLoginLimiter = rateLimit({
  store: createStore("rl:demo:"),
  passOnStoreError: true,
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => ENV.NODE_ENV === "test",
  message: rateLimitResponse(
    "Too many demo logins. Please try again in a few minutes."
  ),
});

export const otpVerifyLimiter = rateLimit({
  store: createStore("rl:otp-verify:"),
  passOnStoreError: true,
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => ENV.NODE_ENV === "test",
  message: rateLimitResponse(
    "Too many attempts. Please try again in a few minutes."
  ),
});

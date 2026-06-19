// src/middleware/rate-limit.js
import rateLimit from "express-rate-limit";

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
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitResponse(
    "Too many attempts. Please try again in a few minutes."
  ),
});

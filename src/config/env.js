// src/config/env.js
//
// Typed, fail-fast environment access. Every variable is read exactly once,
// through a reader that validates its SHAPE, not just its presence - a
// mistyped PORT dies at boot with the variable named instead of silently
// falling back to a default mid-request. App code imports ENV and never
// touches process.env.

/**
 * Reads a boolean environment variable. Absent or empty applies the default;
 * anything other than exactly "true"/"false" throws so a typo ("1", "TRUE")
 * fails at startup instead of silently meaning false.
 */
function envBool(name, defaultValue = false) {
  const v = process.env[name];
  if (!v?.length) return defaultValue;
  if (v !== "true" && v !== "false") {
    throw new Error(
      `Invalid boolean for env variable ${name}: "${v}". Use "true" or "false".`
    );
  }
  return v === "true";
}

/**
 * Reads a numeric environment variable.
 * - If a defaultValue is provided, it acts as an optional numeric var.
 * - If no defaultValue is provided, the variable is treated as required.
 * Throws on NaN so bad values (e.g. "abc") don't silently produce a fallback.
 */
function envNumber(name, defaultValue) {
  const v = process.env[name];
  if (!v?.length) {
    if (defaultValue !== undefined) return defaultValue;
    throw new Error(`Missing required env variable: ${name}`);
  }
  const parsed = Number(v);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid number for env variable: ${name}`);
  }
  return parsed;
}

/**
 * Reads an optional environment variable. Returns undefined (rather than an
 * empty string) when the variable is absent or set to "", keeping downstream
 * consumers clean.
 */
function envOptional(name) {
  const v = process.env[name];
  return v?.length ? v : undefined;
}

/**
 * Reads a required environment variable. Throws at startup if the variable is
 * missing or empty, so misconfigured deployments fail fast rather than at
 * runtime.
 */
function envRequired(name) {
  const v = process.env[name];
  if (!v?.length) throw new Error(`Missing required env variable: ${name}`);
  return v;
}

const GMAIL_USER = envRequired("GMAIL_USER");

const ENV = {
  ACCESS_TOKEN_SECRET: envRequired("ACCESS_TOKEN_SECRET"),

  ADMIN_EMAIL: envRequired("ADMIN_EMAIL"),
  ADMIN_FIRSTNAME: envRequired("ADMIN_FIRSTNAME"),
  ADMIN_LASTNAME: envRequired("ADMIN_LASTNAME"),
  ADMIN_PASSWORD: envRequired("ADMIN_PASSWORD"),
  ADMIN_PHONE: envOptional("ADMIN_PHONE"),
  /** Gate for `npm run seed`: false (default) makes the seed a no-op, so a
   * deploy can never silently plant demo credentials in production. */
  ADMIN_SEED_ENABLED: envBool("ADMIN_SEED_ENABLED"),

  CLOUDINARY_API_KEY: envRequired("CLOUDINARY_API_KEY"),
  CLOUDINARY_API_SECRET: envRequired("CLOUDINARY_API_SECRET"),
  CLOUDINARY_CLOUD_NAME: envRequired("CLOUDINARY_CLOUD_NAME"),

  /** Cookie scope for the auth cookies (unset = current host only). */
  COOKIE_DOMAIN: envOptional("COOKIE_DOMAIN"),
  CORS_ACCESS: envOptional("CORS_ACCESS"),
  /** The venue timezone the "HH:MM" event windows are written in. */
  EVENT_TIMEZONE: envOptional("EVENT_TIMEZONE") ?? "Africa/Accra",
  DATABASE_URL: envRequired("DATABASE_URL"),
  FRONTEND_URL: envRequired("FRONTEND_URL"),

  /** Frog (Wigal) SMS credentials - all three unset means log-only SMS. */
  FROG_API_KEY: envOptional("FROG_API_KEY"),
  FROG_SENDER_ID: envOptional("FROG_SENDER_ID"),
  FROG_USERNAME: envOptional("FROG_USERNAME"),

  GMAIL_PASSWORD: envRequired("GMAIL_PASSWORD"),
  GMAIL_USER,

  NODE_ENV: envOptional("NODE_ENV") ?? "development",
  PORT: envNumber("PORT", 8080),

  REDIS_URL: envRequired("REDIS_URL"),
  REFRESH_TOKEN_SECRET: envRequired("REFRESH_TOKEN_SECRET"),

  /** Error tracking (Sentry). Optional: unset disables reporting. */
  SENTRY_DSN: envOptional("SENTRY_DSN"),

  SMTP_HOST: envRequired("SMTP_HOST"),
  /** From-address on outgoing mail; defaults to the SMTP account user. */
  SMTP_MAIL: envOptional("SMTP_MAIL") ?? GMAIL_USER,
  SMTP_PORT: envNumber("SMTP_PORT", 587),
  SMTP_SECURE: envBool("SMTP_SECURE"),

  /**
   * The web process runs the BullMQ workers in-process by default (single
   * deployment). Set to true on the WEB process when a dedicated worker
   * process runs `npm run worker`, so jobs are never processed twice.
   */
  WEB_DISABLE_WORKERS: envBool("WEB_DISABLE_WORKERS"),
};

export default ENV;

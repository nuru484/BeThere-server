// src/utils/cookie-manager.js
//
// Auth lives in httpOnly cookies ONLY - no token ever reaches JavaScript,
// so an XSS cannot exfiltrate a session. sameSite=lax blocks cross-site
// POSTs from sending them (CSRF baseline) while keeping top-level
// navigation logins working.
import ENV from "../config/env.js";

const base = {
  httpOnly: true,
  sameSite: "lax",
  secure: ENV.NODE_ENV === "production",
  ...(ENV.COOKIE_DOMAIN ? { domain: ENV.COOKIE_DOMAIN } : {}),
};

const ACCESS_MAX_AGE_MS = 30 * 60 * 1000;
const REFRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const PENDING_2FA_MAX_AGE_MS = 5 * 60 * 1000;

export const CookieManager = {
  setAuthCookies(res, { accessToken, refreshToken }) {
    res.cookie("accessToken", accessToken, { ...base, maxAge: ACCESS_MAX_AGE_MS });
    res.cookie("refreshToken", refreshToken, {
      ...base,
      maxAge: REFRESH_MAX_AGE_MS,
    });
  },

  clearAuthCookies(res) {
    res.clearCookie("accessToken", base);
    res.clearCookie("refreshToken", base);
  },

  getAccessToken(req) {
    return req.cookies?.accessToken;
  },

  getRefreshToken(req) {
    return req.cookies?.refreshToken;
  },

  /** Short-lived signed marker carried between password step and 2FA code. */
  setPending2fa(res, token) {
    res.cookie("twoFaPending", token, { ...base, maxAge: PENDING_2FA_MAX_AGE_MS });
  },

  getPending2fa(req) {
    return req.cookies?.twoFaPending;
  },

  clearPending2fa(res) {
    res.clearCookie("twoFaPending", base);
  },
};

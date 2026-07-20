// src/utils/cookie-manager.js
//
// Auth lives in httpOnly cookies ONLY - no token ever reaches JavaScript,
// so an XSS cannot exfiltrate a session. sameSite=lax blocks cross-site
// POSTs from sending them (CSRF baseline) while keeping top-level
// navigation logins working.
//
// Cookie names are app-namespaced (`bethere_*`). The API and web app share a
// registrable domain with sibling apps (e.g. other *.manuru.dev projects); a
// generic name like `accessToken` set by a sibling under `.manuru.dev` would
// be sent to this API too and, being first in the Cookie header, shadow ours -
// the parser takes the first value, so we'd verify a foreign token and 401
// with "Invalid access token". Unique names make that collision impossible and
// let any stale broad-domain cookie be ignored.
import ENV from "../config/env.js";
import { TOKEN_LIFETIMES } from "../config/constants.js";

export const COOKIE_NAMES = {
  access: "bethere_accessToken",
  refresh: "bethere_refreshToken",
  pending2fa: "bethere_twoFaPending",
};

const base = {
  httpOnly: true,
  sameSite: "lax",
  secure: ENV.NODE_ENV === "production",
  ...(ENV.COOKIE_DOMAIN ? { domain: ENV.COOKIE_DOMAIN } : {}),
};

// Cookie lifetime must match the corresponding JWT lifetime, so both come
// from the shared TOKEN_LIFETIMES definition (see config/constants.js).
const {
  ACCESS_MAX_AGE_MS,
  REFRESH_MAX_AGE_MS,
  PENDING_2FA_MAX_AGE_MS,
} = TOKEN_LIFETIMES;

export const CookieManager = {
  setAuthCookies(res, { accessToken, refreshToken }) {
    res.cookie(COOKIE_NAMES.access, accessToken, {
      ...base,
      maxAge: ACCESS_MAX_AGE_MS,
    });
    res.cookie(COOKIE_NAMES.refresh, refreshToken, {
      ...base,
      maxAge: REFRESH_MAX_AGE_MS,
    });
  },

  clearAuthCookies(res) {
    res.clearCookie(COOKIE_NAMES.access, base);
    res.clearCookie(COOKIE_NAMES.refresh, base);
  },

  getAccessToken(req) {
    return req.cookies?.[COOKIE_NAMES.access];
  },

  getRefreshToken(req) {
    return req.cookies?.[COOKIE_NAMES.refresh];
  },

  /** Short-lived signed marker carried between password step and 2FA code. */
  setPending2fa(res, token) {
    res.cookie(COOKIE_NAMES.pending2fa, token, {
      ...base,
      maxAge: PENDING_2FA_MAX_AGE_MS,
    });
  },

  getPending2fa(req) {
    return req.cookies?.[COOKIE_NAMES.pending2fa];
  },

  clearPending2fa(res) {
    res.clearCookie(COOKIE_NAMES.pending2fa, base);
  },
};

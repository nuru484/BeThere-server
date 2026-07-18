// src/controllers/auth.js
//
// Thin HTTP adapters over the auth service. Tokens travel ONLY in httpOnly
// cookies: bodies carry the safe user (and flow flags), never a token.
import { asyncHandler, ValidationError } from "../middleware/error-handler.js";
import { validationMiddleware } from "../validation/validation-error-handler.js";
import {
  loginValidation,
  otpRequestValidation,
  otpVerifyValidation,
  twoFactorCodeValidation,
} from "../validation/auth.js";
import { CookieManager } from "../utils/cookie-manager.js";
import {
  findPrincipal,
  issueOtpForPrincipal,
  loginWithPassword,
  logout as logoutSession,
  requestOtpLogin,
  setTwoFactorEnabled,
  verifyOtpLogin,
  verifyTwoFactorLogin,
} from "../services/auth-facade.js";

const handleLogin = asyncHandler(async (req, res, _next) => {
  const { email, password } = req.body;

  const result = await loginWithPassword(email, password);

  if (result.twoFactorRequired) {
    CookieManager.setPending2fa(res, result.pendingToken);
    return res.json({
      message: "Enter the verification code we sent you.",
      data: { twoFactorRequired: true, channel: result.channel },
    });
  }

  CookieManager.setAuthCookies(res, result);
  res.json({
    message: "Login successful",
    data: { user: result.user },
  });
});

export const login = [validationMiddleware.create(loginValidation), handleLogin];

const handleVerify2fa = asyncHandler(async (req, res, _next) => {
  const pending = CookieManager.getPending2fa(req);
  if (!pending) {
    throw new ValidationError("Your login expired. Please sign in again.");
  }

  const result = await verifyTwoFactorLogin(pending, req.body.code);

  CookieManager.clearPending2fa(res);
  CookieManager.setAuthCookies(res, result);
  res.json({
    message: "Login successful",
    data: { user: result.user },
  });
});

export const verify2fa = [
  validationMiddleware.create(twoFactorCodeValidation),
  handleVerify2fa,
];

/** Passwordless OTP login, step 1 (attendants; phone-first). */
const handleOtpRequest = asyncHandler(async (req, res, _next) => {
  const { channel } = await requestOtpLogin(req.body.identifier);

  // Enumeration-safe: same message whether or not the account exists.
  res.json({
    message: "If that account exists, a code is on its way.",
    data: { channel },
  });
});

export const otpRequest = [
  validationMiddleware.create(otpRequestValidation),
  handleOtpRequest,
];

/** Passwordless OTP login, step 2. */
const handleOtpVerify = asyncHandler(async (req, res, _next) => {
  const result = await verifyOtpLogin(req.body.identifier, req.body.code);

  CookieManager.setAuthCookies(res, result);
  res.json({
    message: "Login successful",
    data: { user: result.user },
  });
});

export const otpVerify = [
  validationMiddleware.create(otpVerifyValidation),
  handleOtpVerify,
];

/** 2FA management for the signed-in principal: send a code first. */
export const twoFactorChallenge = asyncHandler(async (req, res, _next) => {
  const principal = await findPrincipal(req.user.kind, req.user.id);
  const { channel } = await issueOtpForPrincipal(
    req.user.kind,
    principal,
    "TWO_FACTOR"
  );

  res.json({
    message: "We sent you a verification code.",
    data: { channel },
  });
});

const handleTwoFactorEnable = asyncHandler(async (req, res, _next) => {
  const user = await setTwoFactorEnabled(
    req.user.kind,
    req.user.id,
    req.body.code,
    true
  );
  res.json({ message: "Two-factor authentication is now on.", data: { user } });
});

export const twoFactorEnable = [
  validationMiddleware.create(twoFactorCodeValidation),
  handleTwoFactorEnable,
];

const handleTwoFactorDisable = asyncHandler(async (req, res, _next) => {
  const user = await setTwoFactorEnabled(
    req.user.kind,
    req.user.id,
    req.body.code,
    false
  );
  res.json({ message: "Two-factor authentication is now off.", data: { user } });
});

export const twoFactorDisable = [
  validationMiddleware.create(twoFactorCodeValidation),
  handleTwoFactorDisable,
];

/** Revokes the refresh token and clears the cookies. Always 200. */
export const logout = asyncHandler(async (req, res, _next) => {
  const refreshToken = CookieManager.getRefreshToken(req);
  if (refreshToken) {
    await logoutSession(refreshToken);
  }
  CookieManager.clearAuthCookies(res);
  CookieManager.clearPending2fa(res);

  res.json({ message: "Logged out", data: null });
});

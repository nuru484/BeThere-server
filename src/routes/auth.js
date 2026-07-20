import { Router } from "express";
const router = Router();

import {
  demoLogin,
  login,
  logout,
  me,
  otpRequest,
  otpVerify,
  twoFactorChallenge,
  twoFactorDisable,
  twoFactorEnable,
  verify2fa,
} from "../controllers/auth.js";
import { authenticateJWT } from "../middleware/jwt-authentication.js";
import {
  demoLoginLimiter,
  loginLimiter,
  otpRequestLimiter,
  otpVerifyLimiter,
} from "../middleware/rate-limit.js";

router.post("/login", loginLimiter, login);
router.post("/login/2fa", otpVerifyLimiter, verify2fa);
router.post("/demo-login", demoLoginLimiter, ...demoLogin);
router.post("/otp/request", otpRequestLimiter, otpRequest);
router.post("/otp/verify", otpVerifyLimiter, otpVerify);
router.post("/logout", logout);

// The signed-in principal, resolved from the cookie (client hydration).
router.get("/me", authenticateJWT, me);

// 2FA management for the signed-in principal (code-proven toggles). The
// challenge sends an SMS/email per hit, so it carries the same limiter as its
// sibling send-costing endpoint (the service-level 60s cooldown is the second
// layer, not the only one).
router.post(
  "/2fa/challenge",
  otpRequestLimiter,
  authenticateJWT,
  twoFactorChallenge
);
router.post("/2fa/enable", authenticateJWT, twoFactorEnable);
router.post("/2fa/disable", authenticateJWT, twoFactorDisable);

export default router;

import { Router } from "express";
const router = Router();

import {
  login,
  logout,
  otpRequest,
  otpVerify,
  twoFactorChallenge,
  twoFactorDisable,
  twoFactorEnable,
  verify2fa,
} from "../controllers/auth.js";
import { authenticateJWT } from "../middleware/jwt-authentication.js";
import {
  loginLimiter,
  otpRequestLimiter,
  otpVerifyLimiter,
} from "../middleware/rate-limit.js";

router.post("/login", loginLimiter, login);
router.post("/login/2fa", otpVerifyLimiter, verify2fa);
router.post("/otp/request", otpRequestLimiter, otpRequest);
router.post("/otp/verify", otpVerifyLimiter, otpVerify);
router.post("/logout", logout);

// 2FA management for the signed-in principal (code-proven toggles).
router.post("/2fa/challenge", authenticateJWT, twoFactorChallenge);
router.post("/2fa/enable", authenticateJWT, twoFactorEnable);
router.post("/2fa/disable", authenticateJWT, twoFactorDisable);

export default router;

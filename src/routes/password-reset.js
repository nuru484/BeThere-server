import { Router } from "express";
const router = Router();

import {
  requestPasswordReset,
  verifyResetToken,
  resetPassword,
} from "../controllers/index.js";
import {
  passwordResetRequestLimiter,
  passwordResetConfirmLimiter,
} from "../middleware/rate-limit.js";

router.post("/request", passwordResetRequestLimiter, ...requestPasswordReset);

router.post(
  "/verify-reset-token",
  passwordResetConfirmLimiter,
  ...verifyResetToken
);

router.post("/", passwordResetConfirmLimiter, ...resetPassword);

export default router;

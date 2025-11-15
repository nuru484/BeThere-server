import { Router } from "express";
const router = Router();

import {
  requestPasswordReset,
  verifyResetToken,
  resetPassword,
} from "../controllers/index.js";

router.post("/request", ...requestPasswordReset);

router.post("/verify-reset-token", ...verifyResetToken);

router.post("/", ...resetPassword);

export default router;

import { Router } from "express";
const router = Router();

import { refreshToken } from "../controllers/index.js";
import { refreshTokenLimiter } from "../middleware/rate-limit.js";

router.post("/", refreshTokenLimiter, refreshToken);

export default router;

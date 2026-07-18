import { Router } from "express";
const router = Router();

import { login, logout } from "../controllers/auth.js";
import { loginLimiter } from "../middleware/rate-limit.js";

router.post("/login", loginLimiter, login);
router.post("/logout", logout);

export default router;

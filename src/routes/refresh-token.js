import { Router } from "express";
const router = Router();

import { refreshToken } from "../controllers/index.js";

router.post("/", refreshToken);

export default router;

import { Router } from "express";
const router = Router();

import { login } from "../controllers/index.js";

router.post("/login", login);

export default router;

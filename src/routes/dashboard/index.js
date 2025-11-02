import { Router } from "express";
const router = Router();

import userDashboardRoutes from "./users.js";

router.use("/", userDashboardRoutes);

export default router;

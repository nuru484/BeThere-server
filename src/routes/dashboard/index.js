import { Router } from "express";
const router = Router();

import userDashboardRoutes from "./users.js";
import adminDashboardRoutes from "./admin.js";

router.use("/users", userDashboardRoutes);
router.use("/admin", adminDashboardRoutes);

export default router;

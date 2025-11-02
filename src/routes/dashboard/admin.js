import { Router } from "express";
const router = Router();

import {
  getAdminDashboardTotals,
  getAllUsersAttendanceData,
} from "../../controllers/index.js";
import { authorizeRole } from "../../middleware/authorize-role.js";
import { authenticateJWT } from "../../middleware/jwt-authentication.js";

router.get(
  "/totals",
  authenticateJWT,
  authorizeRole(["ADMIN"]),
  getAdminDashboardTotals
);

router.get(
  "/attendance-data",
  authenticateJWT,
  authorizeRole(["ADMIN"]),
  getAllUsersAttendanceData
);

export default router;

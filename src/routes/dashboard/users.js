import { Router } from "express";
const router = Router();

import {
  getUserDashboardTotals,
  getRecentEvents,
  getUserAttendanceData,
} from "../../controllers/index.js";
import { authorizeRole } from "../../middleware/authorize-role.js";
import { authenticateJWT } from "../../middleware/jwt-authentication.js";

router.get(
  "/totals",
  authenticateJWT,
  authorizeRole(["ADMIN", "USER"]),
  getUserDashboardTotals
);

router.get(
  "/recent-events",
  authenticateJWT,
  authorizeRole(["ADMIN", "USER"]),
  getRecentEvents
);

router.get(
  "/attendance-data",
  authenticateJWT,
  authorizeRole(["ADMIN", "USER"]),
  getUserAttendanceData
);

export default router;

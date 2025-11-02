import { Router } from "express";
const router = Router();

import {
  getSystemOverview,
  getAttendanceLeaderboard,
  getRecentEvents,
} from "../../controllers/index.js";
import { authorizeRole } from "../../middleware/authorize-role.js";
import { authenticateJWT } from "../../middleware/jwt-authentication.js";

router.get(
  "/analytics/overview",
  authenticateJWT,
  authorizeRole(["ADMIN", "USER"]),
  getSystemOverview
);

router.get(
  "/analytics/leaderboard",
  authenticateJWT,
  authorizeRole(["ADMIN", "USER"]),
  getAttendanceLeaderboard
);

router.get(
  "/analytics/recent-events",
  authenticateJWT,
  authorizeRole(["ADMIN", "USER"]),
  getRecentEvents
);

export default router;

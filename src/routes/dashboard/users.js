import { Router } from "express";
const router = Router();

import {
  getTodaysEvents,
  getRecentEventAttendanceSummary,
  getLastFiveEventsAttended,
} from "../../controllers/index.js";
import { authorizeRole } from "../../middleware/authorize-role.js";
import { authenticateJWT } from "../../middleware/jwt-authentication.js";

router.get(
  "/todays-events",
  authenticateJWT,
  authorizeRole(["ADMIN", "USER"]),
  getTodaysEvents
);

router.get(
  "/attendance-summary",
  authenticateJWT,
  authorizeRole(["ADMIN", "USER"]),
  getRecentEventAttendanceSummary
);

router.get(
  "/recent-events",
  authenticateJWT,
  authorizeRole(["ADMIN", "USER"]),
  getLastFiveEventsAttended
);

export default router;

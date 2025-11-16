// src/controllers/attendance-reports.js
import express from "express";
import {
  getAttendanceReport,
  getAttendanceSummary,
  getEventAttendanceRate,
  getUserAttendanceRate,
} from "../controllers/index.js";

import { authorizeRole } from "../middleware/authorize-role.js";
import { authenticateJWT } from "../middleware/jwt-authentication.js";

const router = express.Router();

router.use(authenticateJWT);

router.get("/", authorizeRole("ADMIN"), getAttendanceReport);

router.get("/summary", authorizeRole(["ADMIN"]), getAttendanceSummary);

router.get(
  "/event/:eventId/rate",
  authorizeRole(["ADMIN"]),
  getEventAttendanceRate
);

router.get("/user/:userId/rate", getUserAttendanceRate);

export default router;

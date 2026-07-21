// src/routes/attendance-reports.js
import express from "express";
import { getAttendanceReports } from "../controllers/index.js";
import { exportAttendanceReport } from "../controllers/attendance-reports.js";
import { authorizeRole } from "../middleware/authorize-role.js";
import { authenticateJWT } from "../middleware/jwt-authentication.js";

const router = express.Router();

router.get("/", authenticateJWT, authorizeRole(["ADMIN"]), getAttendanceReports);

// The .xlsx export of the same filtered report.
router.get(
  "/export",
  authenticateJWT,
  authorizeRole(["ADMIN"]),
  exportAttendanceReport
);

export default router;

// src/controllers/attendance-reports.js
import express from "express";
import { getAttendanceReports } from "../controllers/index.js";
import { authorizeRole } from "../middleware/authorize-role.js";
import { authenticateJWT } from "../middleware/jwt-authentication.js";

const router = express.Router();

router.get("/", authenticateJWT, authorizeRole("ADMIN"), getAttendanceReports);

export default router;

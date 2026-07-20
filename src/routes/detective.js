import { Router } from "express";
const router = Router();

import {
  getAuditLogs,
  getAnomalies,
  resolveAnomaly,
} from "../controllers/detective.js";
import { authorizeRole } from "../middleware/authorize-role.js";
import { authenticateJWT } from "../middleware/jwt-authentication.js";

// Admin review surface for the detective controls the attendance flow writes.
router.get("/audit-logs", authenticateJWT, authorizeRole(["ADMIN"]), getAuditLogs);
router.get("/anomalies", authenticateJWT, authorizeRole(["ADMIN"]), getAnomalies);
router.patch(
  "/anomalies/:anomalyId/resolve",
  authenticateJWT,
  authorizeRole(["ADMIN"]),
  resolveAnomaly
);

export default router;

import { Router } from "express";
const router = Router();

import {
  createAttendance,
  updateAttendance,
  getEventAttendance,
  getUserAttendance,
  getUserEventAttendance,
} from "../controllers/index.js";

import { authorizeRole } from "../middleware/authorizeRole.js";
import { authenticateJWT } from "../middleware/jwtAuthentication.js";

router.post("/", createAttendance);

router.put("/", authenticateJWT, updateAttendance);

router.get(
  "/user/:userId",
  authenticateJWT,
  authorizeRole(["ADMIN", "USER"]),
  getUserAttendance
);

router.get(
  "/event/:eventId",
  authenticateJWT,
  authorizeRole(["ADMIN"]),
  getEventAttendance
);

router.get(
  "/user/:userId/event/:eventId",
  authenticateJWT,
  authorizeRole(["ADMIN", "USER"]),
  getUserEventAttendance
);

export default router;

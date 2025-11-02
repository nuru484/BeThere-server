import { Router } from "express";
const router = Router();

import {
  createAttendance,
  updateAttendance,
  getEventAttendance,
  getUserAttendance,
  getUserEventAttendance,
} from "../controllers/index.js";

import { authorizeRole } from "../middleware/authorize-role.js";
import { authenticateJWT } from "../middleware/jwt-authentication.js";

router.post(
  "/",
  authenticateJWT,
  authorizeRole(["ADMIN", "USER"]),
  ...createAttendance
);

router.put(
  "/",
  authenticateJWT,
  authorizeRole(["ADMIN", "USER"]),
  ...updateAttendance
);

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

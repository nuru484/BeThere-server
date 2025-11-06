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
  "/users/:userId",
  authenticateJWT,
  authorizeRole(["ADMIN", "USER"]),
  getUserAttendance
);

router.get(
  "/events/:eventId",
  authenticateJWT,
  authorizeRole(["ADMIN"]),
  getEventAttendance
);

router.get(
  "/users/:userId/events/:eventId",
  authenticateJWT,
  authorizeRole(["ADMIN", "USER"]),
  getUserEventAttendance
);

export default router;

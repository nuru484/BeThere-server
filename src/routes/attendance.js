import { Router } from "express";
const router = Router();

import {
  createAttendance,
  createAttendanceChallenge,
  updateAttendance,
  getEventAttendance,
  getUserAttendance,
  getUserEventAttendance,
} from "../controllers/index.js";

import { authorizeRole } from "../middleware/authorize-role.js";
import { authenticateJWT } from "../middleware/jwt-authentication.js";
import { frameUpload } from "../config/multer-setup.js";
import { LIVENESS } from "../config/constants.js";

// Step 1: fail-fast preflight that mints a randomized liveness challenge.
router.post(
  "/:eventId/challenge",
  authenticateJWT,
  authorizeRole(["USER"]),
  ...createAttendanceChallenge
);

// Step 2: the check-in itself. Frames arrive as multipart files ("frames");
// the server does the face + liveness verification against them.
router.post(
  "/:eventId",
  authenticateJWT,
  authorizeRole(["USER"]),
  frameUpload.array("frames", LIVENESS.MAX_FRAMES),
  ...createAttendance
);

// Check-out now also uploads frames for server-side liveness (multipart).
router.put(
  "/:eventId",
  authenticateJWT,
  authorizeRole(["USER"]),
  frameUpload.array("frames", LIVENESS.MAX_FRAMES),
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

import { Router } from "express";
const router = Router();

import {
  createEvent,
  updateEvent,
  deleteEvent,
  getEventById,
  getAllEvents,
  getVenueCodes,
} from "../controllers/index.js";
import { authorizeRole } from "../middleware/authorize-role.js";
import { authenticateJWT } from "../middleware/jwt-authentication.js";
import { upload } from "../config/multer-setup.js";

// Multer runs before validation so multipart bodies are parsed into
// req.body/req.file by the time the validators see them. Plain JSON
// requests pass through upload.single untouched.
router.post(
  "/",
  authenticateJWT,
  authorizeRole(["ADMIN"]),
  upload.single("coverImage"),
  ...createEvent
);

router.put(
  "/:eventId",
  authenticateJWT,
  authorizeRole(["ADMIN"]),
  upload.single("coverImage"),
  ...updateEvent
);

router.delete(
  "/:eventId",
  authenticateJWT,
  authorizeRole(["ADMIN"]),
  deleteEvent
);


// Admin venue display: rotating presence codes for this event's screen.
router.get(
  "/:eventId/venue-codes",
  authenticateJWT,
  authorizeRole(["ADMIN"]),
  getVenueCodes
);

router.get(
  "/:eventId",
  authenticateJWT,
  authorizeRole(["ADMIN", "USER"]),
  getEventById
);

router.get(
  "/",
  authenticateJWT,
  authorizeRole(["ADMIN", "USER"]),
  getAllEvents
);

export default router;

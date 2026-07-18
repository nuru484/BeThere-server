import { Router } from "express";
const router = Router();

import {
  createEvent,
  updateEvent,
  deleteEvent,
  getEventById,
  getAllEvents,
} from "../controllers/index.js";
import { authorizeRole } from "../middleware/authorize-role.js";
import { authenticateJWT } from "../middleware/jwt-authentication.js";

router.post("/", authenticateJWT, authorizeRole(["ADMIN"]), ...createEvent);

router.put(
  "/:eventId",
  authenticateJWT,
  authorizeRole(["ADMIN"]),
  ...updateEvent
);

router.delete(
  "/:eventId",
  authenticateJWT,
  authorizeRole(["ADMIN"]),
  deleteEvent
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

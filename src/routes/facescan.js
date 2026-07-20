import {
  addFaceScan,
  createEnrollmentChallenge,
  getUserFaceScan,
  deleteUserFaceScan,
} from "../controllers/index.js";
import { frameUpload } from "../config/multer-setup.js";
import { LIVENESS } from "../config/constants.js";
import { authorizeRole } from "../middleware/authorize-role.js";
import { authenticateJWT } from "../middleware/jwt-authentication.js";

import { Router } from "express";
const router = Router();

// Step 1: mint the randomized liveness challenge for enrollment.
router.post(
  "/challenge",
  authenticateJWT,
  authorizeRole(["USER"]),
  createEnrollmentChallenge
);

// Step 2: the captured frames. The server derives the template from these;
// it no longer accepts a descriptor computed in the browser.
router.post(
  "/",
  authenticateJWT,
  authorizeRole(["USER"]),
  frameUpload.array("frames", LIVENESS.MAX_FRAMES),
  ...addFaceScan
);

router.get(
  "/:userId",
  authenticateJWT,
  authorizeRole(["ADMIN", "USER"]),
  getUserFaceScan
);

router.delete(
  "/:userId",
  authenticateJWT,
  authorizeRole(["ADMIN"]),
  deleteUserFaceScan
);

export default router;

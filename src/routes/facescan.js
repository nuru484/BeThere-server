import {
  addFaceScan,
  getUserFaceScan,
  deleteUserFaceScan,
} from "../controllers/index.js";
import { authorizeRole } from "../middleware/authorize-role.js";
import { authenticateJWT } from "../middleware/jwt-authentication.js";

import { Router } from "express";
const router = Router();

router.post(
  "/",
  authenticateJWT,
  authorizeRole(["ADMIN", "USER"]),
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

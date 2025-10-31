import {
  addFaceScan,
  getFaceScan,
  deleteFaceScan,
} from "../controllers/index.js";
import { authorizeRole } from "../middleware/authorize-role.js";
import { authenticateJWT } from "../middleware/jwt-authentication.js";

import { Router } from "express";
const router = Router();

router.post("/", authenticateJWT, addFaceScan);
router.get("/:userId", authenticateJWT, getFaceScan);

router.delete(
  "/:userId",
  authenticateJWT,
  authorizeRole(["ADMIN"]),
  deleteFaceScan
);

export default router;

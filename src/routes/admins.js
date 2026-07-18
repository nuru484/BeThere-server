import { Router } from "express";
const router = Router();

import {
  changeAdminPassword,
  createAdmin,
  deleteAdmin,
  getAllAdmins,
} from "../controllers/admins.js";
import { authorizeRole } from "../middleware/authorize-role.js";
import { authenticateJWT } from "../middleware/jwt-authentication.js";

router.post("/", authenticateJWT, authorizeRole(["ADMIN"]), ...createAdmin);
router.get("/", authenticateJWT, authorizeRole(["ADMIN"]), getAllAdmins);
router.patch(
  "/change-password",
  authenticateJWT,
  authorizeRole(["ADMIN"]),
  ...changeAdminPassword
);
router.delete(
  "/:adminId",
  authenticateJWT,
  authorizeRole(["ADMIN"]),
  deleteAdmin
);

export default router;

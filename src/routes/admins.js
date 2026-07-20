import { Router } from "express";
const router = Router();

import {
  changeAdminPassword,
  createAdmin,
  deleteAdmin,
  getAdminById,
  getAllAdmins,
  updateAdminProfile,
  updateAdminProfilePicture,
} from "../controllers/admins.js";
import { authorizeRole } from "../middleware/authorize-role.js";
import { authenticateJWT } from "../middleware/jwt-authentication.js";
import { upload } from "../config/multer-setup.js";
import { validateImageUploads } from "../middleware/validate-image-upload.js";

router.post("/", authenticateJWT, authorizeRole(["ADMIN"]), ...createAdmin);
router.get("/", authenticateJWT, authorizeRole(["ADMIN"]), getAllAdmins);
router.patch(
  "/change-password",
  authenticateJWT,
  authorizeRole(["ADMIN"]),
  ...changeAdminPassword
);

// Self-profile surface, mirroring the /users endpoints so the client can
// switch by role. Reads are open to any admin; mutations are self-only
// (enforced in the service).
router.get(
  "/:adminId",
  authenticateJWT,
  authorizeRole(["ADMIN"]),
  getAdminById
);
router.put(
  "/:adminId",
  authenticateJWT,
  authorizeRole(["ADMIN"]),
  ...updateAdminProfile
);
router.patch(
  "/:adminId/profile-picture",
  authenticateJWT,
  authorizeRole(["ADMIN"]),
  upload.single("profilePicture"),
  validateImageUploads,
  updateAdminProfilePicture
);

router.delete(
  "/:adminId",
  authenticateJWT,
  authorizeRole(["ADMIN"]),
  deleteAdmin
);

export default router;

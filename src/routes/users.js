import { Router } from "express";
const router = Router();

import {
  addUser,
  updateUserProfile,
  getUserById,
  getAllUsers,
  deleteUser,
  changePassword,
  updateProfilePicture,
} from "../controllers/index.js";
import { authorizeRole } from "../middleware/authorize-role.js";
import { authenticateJWT } from "../middleware/jwt-authentication.js";
import { upload } from "../config/multer-setup.js";
import { validateImageUploads } from "../middleware/validate-image-upload.js";

router.post("/", authenticateJWT, authorizeRole(["ADMIN"]), ...addUser);

router.put(
  "/:userId",
  authenticateJWT,
  authorizeRole(["ADMIN", "USER"]),
  ...updateUserProfile
);


router.get(
  "/:userId",
  authenticateJWT,
  authorizeRole(["ADMIN", "USER"]),
  getUserById
);

router.get("/", authenticateJWT, authorizeRole(["ADMIN"]), getAllUsers);

router.delete(
  "/:userId",
  authenticateJWT,
  authorizeRole(["ADMIN"]),
  deleteUser
);

router.patch(
  "/change-password",
  authenticateJWT,
  authorizeRole(["ADMIN", "USER"]),
  ...changePassword
);


router.patch(
  "/:userId/profile-picture",
  authenticateJWT,
  authorizeRole(["ADMIN", "USER"]),
  upload.single("profilePicture"),
  validateImageUploads,
  updateProfilePicture
);

export default router;

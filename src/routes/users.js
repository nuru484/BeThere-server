import { Router } from "express";
const router = Router();

import {
  addUser,
  updateUserProfile,
  updateUserRole,
  getUserById,
  getAllUsers,
  deleteUser,
  deleteAllUsers,
} from "../controllers/index.js";
import { authorizeRole } from "../middleware/authorize-role.js";
import { authenticateJWT } from "../middleware/jwt-authentication.js";

router.post("/", authenticateJWT, authorizeRole(["ADMIN"]), ...addUser);

router.put(
  "/:userId",
  authenticateJWT,
  authorizeRole(["ADMIN", "USER"]),
  updateUserProfile
);

router.patch(
  "/:userId/role",
  authenticateJWT,
  authorizeRole(["ADMIN"]),
  updateUserRole
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
  deleteAllUsers
);

router.delete("/", authenticateJWT, authorizeRole(["ADMIN"]), deleteUser);

export default router;

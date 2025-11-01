import { Router } from "express";
const router = Router();

import {
  getAllUsers,
  deleteUser,
  updateUser,
  updateUserRole,
} from "../controllers/index.js";
import { authorizeRole } from "../middleware/authorize-role.js";
import { authenticateJWT } from "../middleware/jwt-authentication.js";

router.get("/", authenticateJWT, authorizeRole(["ADMIN"]), getAllUsers);

router.delete(
  "/:userId",
  authenticateJWT,
  authorizeRole(["ADMIN"]),
  deleteUser
);

router.put("/:userId", authenticateJWT, authorizeRole(["ADMIN"]), updateUser);

router.patch(
  "/:userId/role",
  authenticateJWT,
  authorizeRole(["ADMIN"]),
  updateUserRole
);

export default router;

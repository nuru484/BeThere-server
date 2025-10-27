import { Router } from "express";
const router = Router();

import {
  getAllUsers,
  createUserIdentification,
  deleteUser,
  updateUser,
  getAllUserIdentifications,
  updateUserRole,
} from "../controllers/index.js";
import { authorizeRole } from "../middleware/authorizeRole.js";
import { authenticateJWT } from "../middleware/jwtAuthentication.js";

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

router.get(
  "/identification",
  authenticateJWT,
  authorizeRole(["ADMIN"]),
  getAllUserIdentifications
);

router.post(
  "/identification",
  authenticateJWT,
  authorizeRole(["ADMIN"]),
  createUserIdentification
);

export default router;

import prisma from "../config/prisma-client.js";
import {
  asyncHandler,
  ConflictError,
  ValidationError,
  UnauthorizedError,
  NotFoundError,
} from "../middleware/error-handler.js";
import { faceScanValidation } from "../validation/face-scan-validation.js";
import { validationMiddleware } from "../validation/validation-error-handler.js";

const handleAddFaceScan = asyncHandler(async (req, res, next) => {
  const { faceScan } = req.body;
  const userId = req.user.id;

  const user = await prisma.user.findUnique({
    where: { id: parseInt(userId) },
  });

  if (!user) {
    throw new NotFoundError("User not found.");
  }

  if (user.faceScan) {
    throw new ConflictError(
      "User face scan already exists. Contact an admin to reset your face scan before updating."
    );
  }

  const updatedUser = await prisma.user.update({
    where: { id: parseInt(userId) },
    data: { faceScan },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      profilePicture: true,
      phone: true,
      faceScan: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  res.status(200).json({
    message: "Face scan added successfully.",
    data: {
      faceScan: updatedUser.faceScan,
    },
  });
});

export const addFaceScan = [
  validationMiddleware.create(faceScanValidation),
  handleAddFaceScan,
];

export const getUserFaceScan = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;
  const currentUserId = req.user.id;
  const currentUserRole = req.user.role;

  if (!userId || isNaN(parseInt(userId))) {
    throw new ValidationError("Valid user ID is required.");
  }

  const targetUserId = parseInt(userId);

  if (
    targetUserId !== parseInt(currentUserId?.toString() || "0") &&
    currentUserRole !== "ADMIN"
  ) {
    throw new UnauthorizedError(
      "Only admins can access other users' face scans."
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
  });

  if (!user) {
    throw new NotFoundError("User not found.");
  }

  if (!user.faceScan) {
    throw new NotFoundError("No face scan data found for the user.");
  }

  res.status(200).json({
    message: "Face scan retrieved successfully.",
    data: {
      faceScan: user.faceScan,
    },
  });
});

export const deleteUserFaceScan = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;

  if (!userId || isNaN(parseInt(userId))) {
    throw new ValidationError("Valid user ID is required.");
  }

  const user = await prisma.user.findUnique({
    where: { id: parseInt(userId) },
  });

  if (!user) {
    throw new NotFoundError("User not found.");
  }

  if (!user.faceScan) {
    throw new NotFoundError(
      `No face scan data found for user with ID ${userId}.`
    );
  }

  await prisma.user.update({
    where: { id: parseInt(userId) },
    data: { faceScan: null },
  });

  res.status(200).json({
    message: "Face scan deleted successfully.",
  });
});

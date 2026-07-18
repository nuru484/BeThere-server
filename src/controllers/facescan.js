// src/controllers/facescan.js
//
// Thin HTTP adapters over the face-scan service.
import {
  asyncHandler,
  ValidationError,
} from "../middleware/error-handler.js";
import { HTTP_STATUS_CODES } from "../config/constants.js";
import { faceScanValidation } from "../validation/face-scan-validation.js";
import { validationMiddleware } from "../validation/validation-error-handler.js";
import * as faceScanService from "../services/face-scan.service.js";

const parseUserId = (userId) => {
  if (!userId || isNaN(parseInt(userId))) {
    throw new ValidationError("Valid user ID is required.");
  }
  return parseInt(userId);
};

const handleAddFaceScan = asyncHandler(async (req, res, _next) => {
  const updatedUser = await faceScanService.addFaceScan(
    parseInt(req.user.id),
    req.body.faceScan
  );

  res.status(HTTP_STATUS_CODES.OK).json({
    message: "Face scan added successfully.",
    data: {
      faceScan: updatedUser.faceScan,
      user: updatedUser,
    },
  });
});

export const addFaceScan = [
  validationMiddleware.create(faceScanValidation),
  handleAddFaceScan,
];

export const getUserFaceScan = asyncHandler(async (req, res, _next) => {
  const targetUserId = parseUserId(req.params.userId);

  const data = await faceScanService.getFaceScanStatus(req.user, targetUserId);

  res.status(HTTP_STATUS_CODES.OK).json({
    message: "Face scan retrieved successfully.",
    data,
  });
});

export const deleteUserFaceScan = asyncHandler(async (req, res, _next) => {
  const targetUserId = parseUserId(req.params.userId);

  await faceScanService.deleteFaceScan(targetUserId);

  res.status(HTTP_STATUS_CODES.OK).json({
    message: "Face scan deleted successfully.",
  });
});

// src/controllers/facescan.js
//
// Thin HTTP adapters over the face-scan service.
import {
  asyncHandler,
  ValidationError,
} from "../middleware/error-handler.js";
import { HTTP_STATUS_CODES, LIVENESS } from "../config/constants.js";
import { faceScanValidation } from "../validation/face-scan-validation.js";
import { validationMiddleware } from "../validation/validation-error-handler.js";
import * as faceScanService from "../services/face-scan.service.js";
import { assertAttendant } from "../utils/authorization.js";

const parseUserId = (userId) => {
  if (!userId || isNaN(parseInt(userId))) {
    throw new ValidationError("Valid user ID is required.");
  }
  return parseInt(userId);
};

// Step 1 of enrollment: mint the randomized action challenge.
export const createEnrollmentChallenge = asyncHandler(
  async (req, res, _next) => {
    assertAttendant(req.user, "Only attendants can enroll a face scan.");

    const data = await faceScanService.prepareEnrollmentChallenge(
      parseInt(req.user.id)
    );

    res.status(HTTP_STATUS_CODES.OK).json({
      message: "Perform the actions shown to register your face.",
      data,
    });
  }
);

const framesOrThrow = (req) => {
  const files = req.files ?? [];
  if (files.length < LIVENESS.MIN_FRAMES || files.length > LIVENESS.MAX_FRAMES) {
    throw new ValidationError(
      `Please capture between ${LIVENESS.MIN_FRAMES} and ${LIVENESS.MAX_FRAMES} frames.`
    );
  }
  return files.map((file) => file.buffer);
};

// Step 2: the frames themselves. The server derives the template from them -
// no descriptor is ever accepted from the client.
const handleAddFaceScan = asyncHandler(async (req, res, _next) => {
  assertAttendant(req.user, "Only attendants can enroll a face scan.");
  const frameBuffers = framesOrThrow(req);

  const result = await faceScanService.enrollFaceScan(parseInt(req.user.id), {
    frameBuffers,
    consent: req.body.consent,
    challengeToken: req.body.challengeToken,
    ip: req.ip,
  });

  // The descriptor is never echoed back - only the refreshed safe user
  // (with hasFaceScan true) so the client can update its session.
  res.status(HTTP_STATUS_CODES.OK).json({
    message: "Face scan added successfully.",
    data: result,
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

  await faceScanService.deleteFaceScan(targetUserId, {
    actor: req.user,
    ip: req.ip,
  });

  res.status(HTTP_STATUS_CODES.OK).json({
    message: "Face scan deleted successfully.",
  });
});

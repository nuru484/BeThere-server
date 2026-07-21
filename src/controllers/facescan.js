// src/controllers/facescan.js
//
// Thin HTTP adapters over the face-scan service.
import { asyncHandler } from "../middleware/error-handler.js";
import { HTTP_STATUS_CODES } from "../config/constants.js";
import {
  faceScanStepValidation,
  faceScanValidation,
} from "../validation/face-scan-validation.js";
import { validationMiddleware } from "../validation/validation-error-handler.js";
import * as faceScanService from "../services/face-scan.service.js";
import { assertAttendant } from "../utils/authorization.js";
import { framesOrThrow, stepFramesOrThrow } from "../utils/liveness-frames.js";
import { parseId } from "../utils/parse-id.js";

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

// Step 2: the frames themselves. The server derives the template from them -
// no descriptor is ever accepted from the client.
const handleAddFaceScan = asyncHandler(async (req, res, _next) => {
  assertAttendant(req.user, "Only attendants can enroll a face scan.");
  const frameBuffers = framesOrThrow(req.files);

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

// Step-by-step enrollment step 1: mint a step challenge.
export const createEnrollmentStepChallenge = asyncHandler(
  async (req, res, _next) => {
    assertAttendant(req.user, "Only attendants can enroll a face scan.");

    const data = await faceScanService.prepareEnrollmentStepChallenge(
      parseInt(req.user.id)
    );

    res.status(HTTP_STATUS_CODES.OK).json({
      message: "Step-by-step face registration started. Perform the first action.",
      data,
    });
  }
);

// Step-by-step enrollment: verify ONE action; store the template on the last.
const handleStepEnroll = asyncHandler(async (req, res, _next) => {
  assertAttendant(req.user, "Only attendants can enroll a face scan.");
  const frameBuffers = stepFramesOrThrow(req.files);

  const result = await faceScanService.stepEnrollFaceScan(
    parseInt(req.user.id),
    {
      frameBuffers,
      consent: req.body.consent,
      challengeToken: req.body.challengeToken,
      ip: req.ip,
    }
  );

  res.status(HTTP_STATUS_CODES.OK).json({
    message: result.done
      ? "Face scan added successfully."
      : "Action verified. Perform the next action.",
    data: result,
  });
});

export const stepEnrollFaceScan = [
  validationMiddleware.create(faceScanStepValidation),
  handleStepEnroll,
];

export const getUserFaceScan = asyncHandler(async (req, res, _next) => {
  const targetUserId = parseId(req.params.userId, "Valid user ID is required.");

  const data = await faceScanService.getFaceScanStatus(req.user, targetUserId);

  res.status(HTTP_STATUS_CODES.OK).json({
    message: "Face scan retrieved successfully.",
    data,
  });
});

export const deleteUserFaceScan = asyncHandler(async (req, res, _next) => {
  const targetUserId = parseId(req.params.userId, "Valid user ID is required.");

  await faceScanService.deleteFaceScan(targetUserId, {
    actor: req.user,
    ip: req.ip,
  });

  res.status(HTTP_STATUS_CODES.OK).json({
    message: "Face scan deleted successfully.",
  });
});

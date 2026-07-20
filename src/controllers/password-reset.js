// src/controllers/password-reset.js
//
// Thin HTTP layer for the password reset flow: validate input, call the
// service, shape the response. All domain logic lives in the service.
import { asyncHandler } from "../middleware/error-handler.js";
import { HTTP_STATUS_CODES } from "../config/constants.js";
import { validationMiddleware } from "../validation/validation-error-handler.js";
import {
  requestPasswordResetValidation,
  verifyResetTokenValidation,
  resetPasswordValidation,
} from "../validation/password-reset-validation.js";
import * as passwordResetService from "../services/password-reset.service.js";

// Same response whether or not the account exists - avoids email enumeration.
const REQUEST_SUCCESS_MESSAGE =
  "If an account exists with this email, you will receive a password reset link shortly.";

const handleRequestPasswordReset = asyncHandler(async (req, res) => {
  await passwordResetService.requestPasswordReset(req.body.email);
  res.status(HTTP_STATUS_CODES.OK).json({ message: REQUEST_SUCCESS_MESSAGE });
});

export const requestPasswordReset = [
  validationMiddleware.create(requestPasswordResetValidation),
  handleRequestPasswordReset,
];

const handleVerifyResetToken = asyncHandler(async (req, res) => {
  const data = await passwordResetService.verifyResetToken(req.body.token);
  res.status(HTTP_STATUS_CODES.OK).json({
    message: "Token is valid. You can proceed to reset your password.",
    data,
  });
});

export const verifyResetToken = [
  validationMiddleware.create(verifyResetTokenValidation),
  handleVerifyResetToken,
];

const handleResetPassword = asyncHandler(async (req, res) => {
  await passwordResetService.resetPassword(req.body);
  res.status(HTTP_STATUS_CODES.OK).json({
    message:
      "Password reset successful. You can now log in with your new password.",
  });
});

export const resetPassword = [
  validationMiddleware.create(resetPasswordValidation),
  handleResetPassword,
];

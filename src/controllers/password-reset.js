import prisma from "../config/prisma-client.js";
import crypto from "crypto";
import bcrypt from "bcrypt";
import {
  asyncHandler,
  ValidationError,
  BadRequestError,
} from "../middleware/error-handler.js";
import { HTTP_STATUS_CODES, BCRYPT_SALT_ROUNDS } from "../config/constants.js";
import { validationMiddleware } from "../validation/validation-error-handler.js";
import sendPasswordResetEmail from "../utils/sendMail.js";
import ENV from "../config/env.js";
import logger from "../utils/logger.js";
import {
  requestPasswordResetValidation,
  verifyResetTokenValidation,
  resetPasswordValidation,
} from "../validation/password-reset-validation.js";

import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const handleRequestPasswordReset = asyncHandler(async (req, res, _next) => {
  const { email } = req.body;

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  const successMessage =
    "If an account exists with this email, you will receive a password reset link shortly.";

  if (!user) {
    return res.status(HTTP_STATUS_CODES.OK || 200).json({
      message: successMessage,
    });
  }

  await prisma.passwordReset.updateMany({
    where: {
      userId: user.id,
      usedAt: null,
      expiresAt: {
        gte: new Date(),
      },
    },
    data: {
      usedAt: new Date(),
    },
  });

  const resetToken = crypto.randomBytes(32).toString("hex");

  const tokenHash = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  // Token expires in 15 minutes
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await prisma.passwordReset.create({
    data: {
      userId: user.id,
      tokenHash: tokenHash,
      expiresAt: expiresAt,
    },
  });

  const resetLink = `${ENV.FRONTEND_URL}/reset-password?token=${resetToken}`;

  const data = {
    userFirstName: user.firstName,
    userLastName: user.lastName,
    resetLink: resetLink,
  };

  try {
    await sendPasswordResetEmail({
      email: user.email,
      subject: "Password Reset - BeThere",
      template: "reset-password.ejs",
      data,
      attachments: [
        {
          filename: "logo.png",
          path: path.join(__dirname, "../../public/assets/logo.png"),
          cid: "logo", // This matches cid:logo in the email template
        },
      ],
    });
  } catch (emailError) {
    logger.error(emailError, "Failed to send password reset email:");
  }

  res.status(HTTP_STATUS_CODES.OK || 200).json({
    message: successMessage,
  });
});

export const requestPasswordReset = [
  validationMiddleware.create(requestPasswordResetValidation),
  handleRequestPasswordReset,
];

const handleVerifyResetToken = asyncHandler(async (req, res, _next) => {
  const { token } = req.query;

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const resetRequest = await prisma.passwordReset.findUnique({
    where: {
      tokenHash: tokenHash,
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
        },
      },
    },
  });

  if (!resetRequest) {
    throw new BadRequestError(
      "Invalid or expired password reset link. Please request a new one."
    );
  }

  if (resetRequest.usedAt) {
    throw new BadRequestError(
      "This password reset link has already been used. Please request a new one."
    );
  }

  if (new Date() > resetRequest.expiresAt) {
    throw new BadRequestError(
      "This password reset link has expired. Please request a new one."
    );
  }

  // Token is valid
  res.status(HTTP_STATUS_CODES.OK || 200).json({
    message: "Token is valid. You can proceed to reset your password.",
    data: {
      email: resetRequest.user.email,
      firstName: resetRequest.user.firstName,
    },
  });
});

export const verifyResetToken = [
  validationMiddleware.create(verifyResetTokenValidation),
  handleVerifyResetToken,
];

const handleResetPassword = asyncHandler(async (req, res, _next) => {
  const { token, newPassword, confirmPassword } = req.body;

  if (newPassword !== confirmPassword) {
    throw new ValidationError("Passwords do not match.");
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const resetRequest = await prisma.passwordReset.findUnique({
    where: {
      tokenHash: tokenHash,
    },
    include: {
      user: true,
    },
  });

  if (!resetRequest) {
    throw new BadRequestError(
      "Invalid or expired password reset link. Please request a new one."
    );
  }

  if (resetRequest.usedAt) {
    throw new BadRequestError(
      "This password reset link has already been used. Please request a new one."
    );
  }

  if (new Date() > resetRequest.expiresAt) {
    throw new BadRequestError(
      "This password reset link has expired. Please request a new one."
    );
  }

  const isSamePassword = await bcrypt.compare(
    newPassword,
    resetRequest.user.password
  );

  if (isSamePassword) {
    throw new BadRequestError(
      "New password must be different from your current password."
    );
  }

  // Hash the new password
  const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);

  // Update password and mark token as used in a transaction
  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetRequest.userId },
      data: { password: hashedPassword },
    }),
    prisma.passwordReset.update({
      where: { id: resetRequest.id },
      data: { usedAt: new Date() },
    }),
    prisma.passwordReset.updateMany({
      where: {
        userId: resetRequest.userId,
        id: { not: resetRequest.id },
        usedAt: null,
      },
      data: { usedAt: new Date() },
    }),
  ]);

  // TODO: Invalidate all active sessions for this user in the frontend

  res.status(HTTP_STATUS_CODES.OK || 200).json({
    message:
      "Password reset successful. You can now log in with your new password.",
  });
});

export const resetPassword = [
  validationMiddleware.create(resetPasswordValidation),
  handleResetPassword,
];

export const cleanupExpiredTokens = asyncHandler(async (req, res, _next) => {
  const deleted = await prisma.passwordReset.deleteMany({
    where: {
      expiresAt: {
        lt: new Date(),
      },
    },
  });

  res.status(HTTP_STATUS_CODES.OK || 200).json({
    message: `Cleaned up ${deleted.count} expired password reset tokens.`,
  });
});

// src/services/password-reset.service.js
//
// Domain logic for the password reset flow. Controllers stay thin: they parse
// the request, call these functions, and shape the HTTP response. Everything
// security-sensitive (token hashing, expiry, single-use, enumeration safety)
// lives here so it is defined once and reused (HTTP route + future callers).
import crypto from "crypto";
import bcrypt from "bcrypt";
import path from "path";
import { fileURLToPath } from "url";
import { prisma } from "../config/prisma-client.js";
import { BCRYPT_SALT_ROUNDS } from "../config/constants.js";
import { ValidationError, BadRequestError } from "../middleware/error-handler.js";
import sendPasswordResetEmail from "../utils/sendMail.js";
import { revokeAllSessions } from "./auth.service.js";
import ENV from "../config/env.js";
import logger from "../utils/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Reset links are valid for 15 minutes. */
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;

/** Hashes a raw reset token the same way for storage and lookup. */
const hashResetToken = (rawToken) =>
  crypto.createHash("sha256").update(rawToken).digest("hex");

/**
 * Loads a reset request by raw token and asserts it is usable.
 * Throws BadRequestError (with a deliberately generic message) when the token
 * is unknown, already used, or expired — never revealing which.
 * @returns the reset record including its related user.
 */
const getUsableResetRequest = async (rawToken, includeFullUser = false) => {
  const tokenHash = hashResetToken(rawToken);

  const resetRequest = await prisma.passwordReset.findUnique({
    where: { tokenHash },
    include: {
      user: includeFullUser
        ? true
        : { select: { id: true, email: true, firstName: true } },
    },
  });

  if (!resetRequest || resetRequest.usedAt || new Date() > resetRequest.expiresAt) {
    throw new BadRequestError(
      "Invalid or expired password reset link. Please request a new one."
    );
  }

  return resetRequest;
};

/** Sends the reset email; failures are logged but never surfaced to the caller. */
const sendResetEmail = async (user, rawToken) => {
  const resetLink = `${ENV.FRONTEND_URL}/reset-password?token=${rawToken}`;

  try {
    await sendPasswordResetEmail({
      email: user.email,
      subject: "Password Reset - BeThere",
      template: "reset-password.ejs",
      data: {
        userFirstName: user.firstName,
        userLastName: user.lastName,
        resetLink,
      },
      attachments: [
        {
          filename: "logo.png",
          path: path.join(__dirname, "../../public/assets/logo.png"),
          cid: "logo", // matches cid:logo in the email template
        },
      ],
    });
  } catch (emailError) {
    logger.error(emailError, "Failed to send password reset email");
  }
};

/**
 * Starts a password reset: invalidates any outstanding tokens for the user,
 * issues a fresh single-use token, and emails the reset link.
 *
 * Returns nothing and never throws on a missing account — the caller always
 * responds with the same generic message to avoid email enumeration.
 */
export const requestPasswordReset = async (email) => {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!user) return;

  // Invalidate any still-active tokens before issuing a new one.
  await prisma.passwordReset.updateMany({
    where: { userId: user.id, usedAt: null, expiresAt: { gte: new Date() } },
    data: { usedAt: new Date() },
  });

  const rawToken = crypto.randomBytes(32).toString("hex");

  await prisma.passwordReset.create({
    data: {
      userId: user.id,
      tokenHash: hashResetToken(rawToken),
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    },
  });

  await sendResetEmail(user, rawToken);
};

/**
 * Verifies a reset token without consuming it (for the "enter new password"
 * screen). Throws BadRequestError when the token is not usable.
 * @returns minimal user info to greet the user.
 */
export const verifyResetToken = async (rawToken) => {
  const resetRequest = await getUsableResetRequest(rawToken);
  return {
    email: resetRequest.user.email,
    firstName: resetRequest.user.firstName,
  };
};

/**
 * Completes a password reset. Validates the confirmation, rejects reusing the
 * current password, then atomically sets the new password, consumes the token,
 * and invalidates the user's other outstanding tokens.
 */
export const resetPassword = async ({ token, newPassword, confirmPassword }) => {
  if (newPassword !== confirmPassword) {
    throw new ValidationError("Passwords do not match.");
  }

  const resetRequest = await getUsableResetRequest(token, true);

  const isSamePassword = await bcrypt.compare(
    newPassword,
    resetRequest.user.password
  );
  if (isSamePassword) {
    throw new BadRequestError(
      "New password must be different from your current password."
    );
  }

  const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);

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

  // A reset usually means the old credential is suspect - kill every
  // outstanding session along with it.
  await revokeAllSessions(resetRequest.userId);
};

/**
 * Removes expired reset tokens. Invoked by a scheduled background job, not over
 * HTTP. Returns the number of rows deleted.
 */
export const cleanupExpiredResetTokens = async () => {
  const { count } = await prisma.passwordReset.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return count;
};

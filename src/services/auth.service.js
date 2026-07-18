// src/services/auth.service.js
//
// The auth core: credential login, refresh-token ROTATION with
// replay-as-theft response, logout, and session revocation. Every refresh
// JWT carries a jti whose sha256 hash is registered in RefreshToken;
// exchanging it consumes the row and issues a successor. Presenting a
// consumed or unknown jti is treated as theft: the user's tokenVersion
// (session epoch) is bumped and every outstanding refresh token dies, so a
// stolen token cannot outlive its discovery.
//
// Designed for the upcoming auth expansion (face-scan login, OTP
// passwordless): every login method ends in the same issueSession(), so new
// grant types only add a new proof check in front of it.
import crypto from "node:crypto";
import { compare } from "bcrypt";
import jwt from "jsonwebtoken";
import ENV from "../config/env.js";
import { prisma } from "../config/prisma-client.js";
import {
  UnauthorizedError,
  ValidationError,
} from "../middleware/error-handler.js";
import { invalidateCachedTokenVersion } from "../utils/authz-cache.js";

const REFRESH_EXPIRY_DAYS = 7;
const ACCESS_EXPIRY = "30m";

const hashJti = (jti) => crypto.createHash("sha256").update(jti).digest("hex");

/** Strips secrets/biometrics from a user row for API responses. */
export function toSafeUser(user) {
  const { password: _password, faceScan, tokenVersion: _tv, ...rest } = user;
  return { ...rest, hasFaceScan: faceScan != null };
}

/**
 * Mints an access + refresh pair for a live user row and registers the
 * refresh jti. The access token carries the session epoch (tv) so a theft
 * response invalidates it mid-lifetime.
 */
export async function issueSession(user, tx = prisma) {
  const jti = crypto.randomUUID();
  const expiresAt = new Date(
    Date.now() + REFRESH_EXPIRY_DAYS * 24 * 60 * 60 * 1000
  );

  await tx.refreshToken.create({
    data: { userId: user.id, jtiHash: hashJti(jti), expiresAt },
  });

  const accessToken = jwt.sign(
    { id: user.id, role: user.role, tv: user.tokenVersion },
    ENV.ACCESS_TOKEN_SECRET,
    { expiresIn: ACCESS_EXPIRY }
  );

  const refreshToken = jwt.sign({ id: user.id, jti }, ENV.REFRESH_TOKEN_SECRET, {
    expiresIn: `${REFRESH_EXPIRY_DAYS}d`,
  });

  return { accessToken, refreshToken };
}

/** Email + password login. Soft-deleted accounts read as invalid credentials. */
export async function loginWithPassword(email, password) {
  // findFirst so the soft-delete scope applies (findUnique would bypass it).
  const user = await prisma.user.findFirst({ where: { email } });

  if (!user || !password || !user.password) {
    throw new ValidationError("Invalid Credentials");
  }

  const isPasswordValid = await compare(password, user.password);
  if (!isPasswordValid) {
    throw new ValidationError("Invalid Credentials");
  }

  const tokens = await issueSession(user);
  return { ...tokens, user: toSafeUser(user) };
}

/**
 * Rotates a refresh token: consumes the presented jti and issues a
 * successor. A consumed/unknown jti is the theft signal - the epoch bump
 * plus token purge kills every session for that user.
 */
export async function rotateRefreshToken(token) {
  let decoded;
  try {
    decoded = jwt.verify(token, ENV.REFRESH_TOKEN_SECRET);
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      throw new UnauthorizedError("Refresh token expired. Please log in again.", {
        code: "TOKEN_EXPIRED",
      });
    }
    throw new UnauthorizedError("Invalid refresh token", {
      code: "INVALID_TOKEN",
    });
  }

  if (!decoded?.id || !decoded?.jti) {
    throw new UnauthorizedError("Invalid refresh token payload", {
      code: "INVALID_TOKEN",
    });
  }

  const jtiHash = hashJti(decoded.jti);

  // Atomic consume: only one concurrent exchange of the same token wins.
  const consumed = await prisma.refreshToken.updateMany({
    where: { jtiHash, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() },
  });

  if (consumed.count === 0) {
    const known = await prisma.refreshToken.findUnique({ where: { jtiHash } });
    if (known?.consumedAt) {
      // Replay of an already-rotated token: someone holds a stolen copy.
      // Kill every session for this account.
      await prisma.$transaction([
        prisma.user.update({
          where: { id: decoded.id },
          data: { tokenVersion: { increment: 1 } },
        }),
        prisma.refreshToken.deleteMany({ where: { userId: decoded.id } }),
      ]);
      invalidateCachedTokenVersion(decoded.id);
    }
    throw new UnauthorizedError("Invalid refresh token", {
      code: "INVALID_TOKEN",
    });
  }

  // findFirst: a soft-deleted account stops refreshing immediately, and the
  // fresh row carries the CURRENT role/epoch into the new tokens.
  const user = await prisma.user.findFirst({ where: { id: decoded.id } });
  if (!user) {
    throw new UnauthorizedError("Account no longer exists. Please log in again.", {
      code: "INVALID_TOKEN",
    });
  }

  return issueSession(user);
}

/** Consumes the presented refresh token (idempotent, never throws to caller). */
export async function logout(token) {
  try {
    const decoded = jwt.verify(token, ENV.REFRESH_TOKEN_SECRET);
    if (decoded?.jti) {
      await prisma.refreshToken.updateMany({
        where: { jtiHash: hashJti(decoded.jti), consumedAt: null },
        data: { consumedAt: new Date() },
      });
    }
  } catch {
    // An invalid/expired token has nothing to revoke.
  }
}

/**
 * Full session revocation for an account: epoch bump + refresh purge. Used
 * by password change/reset and account deletion so old sessions die there.
 */
export async function revokeAllSessions(userId, tx = prisma) {
  await tx.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
  });
  await tx.refreshToken.deleteMany({ where: { userId } });
  invalidateCachedTokenVersion(userId);
}

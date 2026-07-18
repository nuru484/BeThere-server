// src/middleware/jwt-authentication.js
import ENV from "../config/env.js";
import { prisma } from "../config/prisma-client.js";
import { UnauthorizedError } from "./error-handler.js";
import {
  getCachedTokenVersion,
  setCachedTokenVersion,
} from "../utils/authz-cache.js";
import { verifyJwtToken } from "../utils/verify-jwt-token.js";

/**
 * The user's live session epoch, behind a short cache so the per-request
 * check doesn't hit the DB every time. A theft response or password change
 * bumps tokenVersion, so already-issued access tokens stop working at once
 * instead of riding out their 30 minutes. Returns null when the account no
 * longer exists (deleted accounts lose access immediately - findFirst keeps
 * the soft-delete scope).
 */
const resolveLiveTokenVersion = async (userId) => {
  const cached = getCachedTokenVersion(userId);
  if (cached !== undefined) return cached;

  const user = await prisma.user.findFirst({
    where: { id: userId },
    select: { tokenVersion: true },
  });
  const version = user?.tokenVersion ?? null;
  setCachedTokenVersion(userId, version);
  return version;
};

// Middleware to authenticate users with an access token
export const authenticateJWT = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return next(
      new UnauthorizedError("Authorization header missing", {
        code: "NO_TOKEN",
        layer: "jwt",
      })
    );
  }

  const accessToken = authHeader.split(" ")[1];

  try {
    const decodedUser = await verifyJwtToken(
      accessToken,
      ENV.ACCESS_TOKEN_SECRET
    );

    // Enforce the session epoch: tokens minted before a revocation bump (or
    // for a deleted account) are dead even though their signature is valid.
    const liveVersion = await resolveLiveTokenVersion(decodedUser.id);
    if (liveVersion === null) {
      return next(
        new UnauthorizedError("Account no longer exists. Please log in.", {
          code: "USER_NOT_FOUND",
          layer: "jwt",
        })
      );
    }
    if (decodedUser.tv !== liveVersion) {
      return next(
        new UnauthorizedError("Session revoked. Please log in again.", {
          code: "TOKEN_EXPIRED",
          layer: "jwt",
        })
      );
    }

    req.user = decodedUser;

    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return next(
        new UnauthorizedError("Access token expired.", {
          code: "TOKEN_EXPIRED",
          layer: "jwt",
        })
      );
    }

    if (error.name === "JsonWebTokenError") {
      return next(
        new UnauthorizedError("Invalid access token", {
          code: "INVALID_TOKEN",
          layer: "jwt",
        })
      );
    }
    next(error);
  }
};

// src/controllers/refresh-jwt-token.js
//
// Thin adapter over the rotation service. The heavy lifting (jti consume,
// replay-as-theft response, account re-validation) lives in
// services/auth.service.js.
import { asyncHandler, UnauthorizedError } from "../middleware/error-handler.js";
import { rotateRefreshToken } from "../services/auth.service.js";

export const refreshToken = asyncHandler(async (req, res, _next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    throw new UnauthorizedError("Authorization header missing", {
      code: "NO_TOKEN",
      layer: "jwt",
    });
  }

  const token = authHeader.startsWith("Bearer ")
    ? authHeader.split(" ")[1]
    : authHeader;

  if (!token) {
    throw new UnauthorizedError("No refresh token provided", {
      code: "NO_TOKEN",
      layer: "jwt",
    });
  }

  const tokens = await rotateRefreshToken(token);

  res.json({
    message: "Token refreshed",
    data: tokens,
  });
});

// src/controllers/refresh-jwt-token.js
//
// Cookie-based rotation: reads the refresh cookie, rotates it (consume +
// successor), and re-sets both auth cookies. The body never carries tokens.
import { asyncHandler, UnauthorizedError } from "../middleware/error-handler.js";
import { CookieManager } from "../utils/cookie-manager.js";
// Through the facade, like every other auth controller - the core service
// is not imported directly from the HTTP layer.
import { rotateRefreshToken } from "../services/auth-facade.js";

export const refreshToken = asyncHandler(async (req, res, _next) => {
  const token = CookieManager.getRefreshToken(req);

  if (!token) {
    throw new UnauthorizedError("No refresh token provided", {
      code: "NO_TOKEN",
      layer: "jwt",
    });
  }

  const result = await rotateRefreshToken(token);

  CookieManager.setAuthCookies(res, result);
  res.json({
    message: "Token refreshed",
    data: { user: result.user },
  });
});

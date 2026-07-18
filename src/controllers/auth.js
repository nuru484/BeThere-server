// src/controllers/auth.js
//
// Thin HTTP adapters over the auth service: parse the request, call the
// service, shape the standard { message, data } envelope.
import { asyncHandler } from "../middleware/error-handler.js";
import { validationMiddleware } from "../validation/validation-error-handler.js";
import { loginValidation } from "../validation/auth.js";
import {
  loginWithPassword,
  logout as logoutSession,
} from "../services/auth.service.js";

const handleLogin = asyncHandler(async (req, res, _next) => {
  const { email, password } = req.body;

  const session = await loginWithPassword(email, password);

  res.json({
    message: "Login successful",
    data: session,
  });
});

export const login = [
  validationMiddleware.create(loginValidation),
  handleLogin,
];

/**
 * Revokes the presented refresh token. Idempotent: an invalid or already
 * consumed token still answers 200 so the client can always clear state.
 */
export const logout = asyncHandler(async (req, res, _next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.split(" ")[1]
    : authHeader;

  if (token) {
    await logoutSession(token);
  }

  res.json({ message: "Logged out", data: null });
});

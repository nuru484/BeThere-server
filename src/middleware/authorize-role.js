// src/middleware/authorize-role.js
import { ForbiddenError } from "./error-handler.js";

/**
 * Role gate. Accepts an array of roles (or a single role string) and answers
 * 403 Forbidden - the caller IS authenticated, they just lack permission
 * (401 would tell clients to re-login, which can't help).
 */
export const authorizeRole = (roles) => {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return (req, res, next) => {
    if (!allowed.includes(req.user.role)) {
      throw new ForbiddenError("Forbidden: Insufficient permissions");
    }

    next();
  };
};

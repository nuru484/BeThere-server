import { UnauthorizedError } from "./error-handler.js";

export const authorizeRole = (roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    throw (error = new UnauthorizedError(
      "Forbidden: Insufficient permissions"
    ));
  }

  next();
};

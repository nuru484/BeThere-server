import jwt from "jsonwebtoken";
import ENV from "../config/env.js";
import { verifyJwtToken } from "../utils/verify-jwt-token.js";

export const refreshToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res
      .status(401)
      .json({ message: "Authorization header missing", type: "NO_TOKEN" });
  }

  const refreshToken = authHeader.startsWith("Bearer ")
    ? authHeader.split(" ")[1]
    : authHeader;

  if (!refreshToken) {
    return res
      .status(401)
      .json({ message: "No refresh token provided", type: "NO_TOKEN" });
  }

  try {
    const decodedUser = await verifyJwtToken(
      refreshToken,
      ENV.REFRESH_TOKEN_SECRET
    );

    if (!decodedUser || !decodedUser.id) {
      return res.status(401).json({
        message: "Invalid refresh token payload",
        type: "INVALID_TOKEN",
      });
    }

    const newRefreshToken = jwt.sign(
      { id: decodedUser.id, role: decodedUser.role },
      ENV.REFRESH_TOKEN_SECRET,
      {
        expiresIn: "7d",
      }
    );

    const newAccessToken = jwt.sign(
      { id: decodedUser.id, role: decodedUser.role },
      ENV.ACCESS_TOKEN_SECRET,
      {
        expiresIn: "30s",
      }
    );

    req.user = decodedUser;

    return res.json({ newAccessToken, newRefreshToken });
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        message: "Refresh token expired. Please log in again.",
        type: "TOKEN_EXPIRED",
      });
    }

    if (error.name === "JsonWebTokenError") {
      return res
        .status(401)
        .json({ message: "Invalid refresh token", type: "INVALID_TOKEN" });
    }
    next(error);
  }
};

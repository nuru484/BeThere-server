import ENV from "../config/env.js";
import { verifyJwtToken } from "../utils/verify-jwt-token.js";

// Middleware to authenticate users with  access token
export const authenticateJWT = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  console.log("Request Headers: ", req.headers);

  console.log("auth header: ", authHeader);

  if (!authHeader) {
    return res
      .status(401)
      .json({ message: "Authorization header missing HERE" });
  }

  const accessToken = authHeader.split(" ")[1];

  try {
    const decodedUser = await verifyJwtToken(
      accessToken,
      ENV.ACCESS_TOKEN_SECRET
    );

    req.user = decodedUser;

    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      console.log("Here is the errror!!!");
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

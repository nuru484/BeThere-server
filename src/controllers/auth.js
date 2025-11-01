import prisma from "../config/prisma-client.js";
import { compare } from "bcrypt";
import { CustomError, ValidationError } from "../middleware/error-handler.js";
import ENV from "../config/env.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { validationMiddleware } from "../validation/validation-error-handler.js";
import { loginValidation } from "../validation/auth.js";
import { asyncHandler } from "../middleware/error-handler.js";

const handleLogin = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  if (!user || !password || !user.password) {
    throw new ValidationError("Invalid Credentials");
  }

  const isPasswordValid = await compare(password, user.password);

  if (!isPasswordValid) {
    throw new ValidationError("Invalid Credentials");
  }

  const accessToken = jwt.sign(
    { id: user.id, role: user.role },
    ENV.ACCESS_TOKEN_SECRET,
    {
      expiresIn: "30s",
    }
  );

  const refreshToken = jwt.sign(
    { id: user.id, role: user.role },
    ENV.REFRESH_TOKEN_SECRET,
    {
      expiresIn: "7d",
    }
  );

  const { password: userPassword, ...userWithoutPassword } = user;

  res.json({
    message: "Login successful",
    accessToken,
    refreshToken,
    user: userWithoutPassword,
  });
});

export const login = [
  validationMiddleware.create(loginValidation),
  handleLogin,
];

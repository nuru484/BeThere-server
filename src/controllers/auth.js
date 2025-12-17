import { prisma } from "../config/prisma-client.js";
import { compare } from "bcrypt";
import { ValidationError } from "../middleware/error-handler.js";
import ENV from "../config/env.js";
import jwt from "jsonwebtoken";
import { validationMiddleware } from "../validation/validation-error-handler.js";
import { loginValidation } from "../validation/auth.js";
import { asyncHandler } from "../middleware/error-handler.js";

const handleLogin = asyncHandler(async (req, res, _next) => {
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
      expiresIn: "30m",
    }
  );

  const refreshToken = jwt.sign(
    { id: user.id, role: user.role },
    ENV.REFRESH_TOKEN_SECRET,
    {
      expiresIn: "7d",
    }
  );

  const { password: _userPassword, ...userWithoutPassword } = user;

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

import prisma from "../config/prisma-client.js";
import { compare } from "bcrypt";
import {
  CustomError,
  NotFoundError,
  BadRequestError,
  ValidationError,
} from "../middleware/error-handler.js";
import ENV from "../config/env.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

export const login = async (req, res, next) => {
  const { email, password } = req.body;
  try {
    const user = await prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (!user) {
      throw new NotFoundError("User not found");
    }

    if (!password || (user && !user.password)) {
      throw new BadRequestError("Password or hash missing");
    }

    const isPasswordValid = await compare(password, user.password);

    if (!isPasswordValid) {
      throw new ValidationError(401, "Invalid credentials");
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
  } catch (error) {
    next(error);
  }
};

const idPrefix = "TaTU";

export const signup = async (req, res, next) => {
  const { identification, ...userDetails } = req.body;

  try {
    if (req.user && req.user.role === "ADMIN") {
      const lastIdentification = await prisma.userIdentification.findFirst({
        orderBy: { id: "desc" },
      });

      let newIdentityNumber;
      if (
        lastIdentification &&
        lastIdentification.identityNumber.startsWith(idPrefix)
      ) {
        const numericPart = parseInt(
          lastIdentification.identityNumber.replace(idPrefix, ""),
          10
        );
        newIdentityNumber = `${idPrefix}${numericPart + 1}`;
      } else {
        newIdentityNumber = `${idPrefix}1000000000`;
      }

      const userIdentification = await prisma.userIdentification.create({
        data: {
          identityNumber: newIdentityNumber,
        },
      });

      const hashedPassword = await bcrypt.hash(userDetails.password, 10);

      const user = await prisma.user.create({
        data: {
          ...userDetails,
          password: hashedPassword,
          identification: {
            connect: {
              id: userIdentification.id,
            },
          },
        },
      });

      const { password, ...userWithoutPassword } = user;
      return res.status(201).json({
        message: "Registration successful.",
        data: userWithoutPassword,
      });
    } else {
      const isFirstUser = (await prisma.user.findFirst()) === null;

      if (!isFirstUser && !identification) {
        throw new CustomError(
          400,
          "Identification number is required for registration."
        );
      }

      let userIdentificationId = null;

      if (identification) {
        const userIdentification = await prisma.userIdentification.findUnique({
          where: {
            identityNumber: identification,
          },
          include: {
            user: true,
          },
        });

        if (!userIdentification) {
          throw new CustomError(404, "Invalid identification number.");
        }

        if (userIdentification.user) {
          throw new CustomError(409, "Identification is already taken.");
        }

        userIdentificationId = userIdentification.id;
      }

      const hashedPassword = await bcrypt.hash(userDetails.password, 10);

      const userData = {
        ...userDetails,
        password: hashedPassword,
        role: isFirstUser ? "ADMIN" : "USER",
      };

      if (userIdentificationId) {
        userData.identification = {
          connect: {
            id: userIdentificationId,
          },
        };
      }

      const user = await prisma.user.create({
        data: userData,
      });

      const { password, ...userWithoutPassword } = user;
      return res.status(201).json({
        message: "Registration successful.",
        data: userWithoutPassword,
      });
    }
  } catch (error) {
    next(error);
  }
};

import prisma from "../config/prismaClient.js";
import { compare } from "bcrypt";
import { CustomError } from "../middleware/errorHandler.js";
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
      throw new CustomError(404, "User not found");
    }

    if (!password || (user && !user.password)) {
      throw new Error("Password or hash missing");
    }

    const isPasswordValid = await compare(password, user.password);

    if (!isPasswordValid) {
      throw new CustomError(401, "Invalid credentials");
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
    // Check if req.user exists and is admin
    if (req.user && req.user.role === "ADMIN") {
      // Fetch the last userIdentification
      const lastIdentification = await prisma.userIdentification.findFirst({
        orderBy: { id: "desc" },
      });

      // Generate new identity number
      let newIdentityNumber;
      if (
        lastIdentification &&
        lastIdentification.identityNumber.startsWith(idPrefix)
      ) {
        // Extract numeric part and increment
        const numericPart = parseInt(
          lastIdentification.identityNumber.replace(idPrefix, ""),
          10
        );
        newIdentityNumber = `${idPrefix}${numericPart + 1}`;
      } else {
        // If no previous identification or invalid format, start with TaTU1000000000
        newIdentityNumber = `${idPrefix}1000000000`;
      }

      // Create UserIdentification
      const userIdentification = await prisma.userIdentification.create({
        data: {
          identityNumber: newIdentityNumber,
        },
      });

      // Hash password
      const hashedPassword = await bcrypt.hash(userDetails.password, 10);

      // Create user with identification
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
    }
    // Non-admin or no user
    else {
      // Check if this is the first user
      const isFirstUser = (await prisma.user.findFirst()) === null;

      if (!isFirstUser && !identification) {
        throw new CustomError(
          400,
          "Identification number is required for registration."
        );
      }

      let userIdentificationId = null;

      // If identification is provided, validate and use it
      if (identification) {
        // Check if identification exists in DB and include the related user
        const userIdentification = await prisma.userIdentification.findUnique({
          where: {
            identityNumber: identification,
          },
          include: {
            user: true, // Include the related user data
          },
        });

        if (!userIdentification) {
          throw new CustomError(404, "Invalid identification number.");
        }

        // Check if identification is already taken (correct check for one-to-one relationship)
        if (userIdentification.user) {
          throw new CustomError(409, "Identification is already taken.");
        }

        userIdentificationId = userIdentification.id;
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(userDetails.password, 10);

      // Create user data object
      const userData = {
        ...userDetails,
        password: hashedPassword,
        role: isFirstUser ? "ADMIN" : "USER",
      };

      // Only connect identification if it exists
      if (userIdentificationId) {
        userData.identification = {
          connect: {
            id: userIdentificationId,
          },
        };
      }

      // Create user
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

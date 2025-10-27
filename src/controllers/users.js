import prisma from "../config/prismaClient.js";
import { CustomError } from "../middleware/errorHandler.js";

// Controller to fetch all users with pagination, excluding passwords
export const getAllUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    // Retrieve paginated users with related data, excluding password
    const users = await prisma.user.findMany({
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit),
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        profilePicture: true,
        phoneNumber: true,
        faceScan: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        identification: true,
      },
    });

    const totalRecords = await prisma.user.count();

    if (users.length === 0) {
      return res
        .status(200)
        .json({ message: "There are no users at the moment." });
    }

    res.status(200).json({
      message: "Users successfully fetched.",
      data: users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(totalRecords / parseInt(limit)),
        totalRecords,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Controller to create a UserIdentification
export const createUserIdentification = async (req, res, next) => {
  try {
    const idPrefix = "TaTU"; // Assuming same prefix as signup example
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
      // Start with TaTU1000000000 if no previous identification or invalid format
      newIdentityNumber = `${idPrefix}1000000000`;
    }

    // Create UserIdentification
    const userIdentification = await prisma.userIdentification.create({
      data: {
        identityNumber: newIdentityNumber,
      },
    });

    return res.status(201).json({
      message: "User identification created successfully.",
      data: userIdentification,
    });
  } catch (error) {
    next(error);
  }
};

// Controller to delete a user
export const deleteUser = async (req, res, next) => {
  try {
    const { userId } = req.params;

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: parseInt(userId) },
    });

    if (!user) {
      throw new CustomError(404, "User not found.");
    }

    // Delete user (cascades to UserIdentification due to schema)
    await prisma.user.delete({
      where: { id: parseInt(id) },
    });

    return res.status(200).json({
      message: "User deleted successfully.",
    });
  } catch (error) {
    next(error);
  }
};

// Controller to update user details
export const updateUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const {
      firstName,
      lastName,
      email,
      phoneNumber,
      profilePicture,
      faceScan,
    } = req.body;

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: parseInt(userId) },
    });

    if (!user) {
      throw new CustomError(404, "User not found.");
    }

    // Update user details
    const updatedUser = await prisma.user.update({
      where: { id: parseInt(userId) },
      data: {
        firstName: firstName || user.firstName,
        lastName: lastName || user.lastName,
        email: email || user.email,
        phoneNumber: phoneNumber || user.phoneNumber,
        profilePicture: profilePicture || user.profilePicture,
        faceScan: faceScan || user.faceScan,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        profilePicture: true,
        phoneNumber: true,
        faceScan: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        identification: true,
      },
    });

    return res.status(200).json({
      message: "User updated successfully.",
      data: updatedUser,
    });
  } catch (error) {
    next(error);
  }
};

// Controller to fetch all UserIdentifications with pagination
export const getAllUserIdentifications = async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    // Retrieve paginated user identifications with related user data
    const userIdentifications = await prisma.userIdentification.findMany({
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit),
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            profilePicture: true,
            phoneNumber: true,
            faceScan: true,
            role: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    const totalRecords = await prisma.userIdentification.count();

    if (userIdentifications.length === 0) {
      return res
        .status(200)
        .json({ message: "There are no user identifications at the moment." });
    }

    res.status(200).json({
      message: "User identifications successfully fetched.",
      data: userIdentifications,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(totalRecords / parseInt(limit)),
        totalRecords,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Controller to update user role
export const updateUserRole = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    // Validate role
    if (!["ADMIN", "USER"].includes(role)) {
      throw new CustomError(400, "Invalid role. Must be ADMIN or USER.");
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: parseInt(userId) },
    });

    if (!user) {
      throw new CustomError(404, "User not found.");
    }

    console.log(req);

    // Prevent users from updating their own role
    if (req.user.id === parseInt(userId)) {
      throw new CustomError(403, "You cannot update your own role.");
    }

    // Update user role
    const updatedUser = await prisma.user.update({
      where: { id: parseInt(userId) },
      data: {
        role,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        profilePicture: true,
        phoneNumber: true,
        faceScan: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        identification: true,
      },
    });

    return res.status(200).json({
      message: "User role updated successfully.",
      data: updatedUser,
    });
  } catch (error) {
    next(error);
  }
};

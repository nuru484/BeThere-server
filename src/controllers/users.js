import prisma from "../config/prisma-client.js";
import {
  asyncHandler,
  ValidationError,
  UnauthorizedError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
} from "../middleware/error-handler.js";
import { HTTP_STATUS_CODES, BCRYPT_SALT_ROUNDS } from "../config/constants.js";
import { validationMiddleware } from "../validation/validation-error-handler.js";
import { addUserValidation } from "../validation/users-validation.js";

export const handleAddUser = asyncHandler(async (req, res, next) => {
  const { firstName, lastName, email, password, phone, role } = req.body;

  const existingUserByEmail = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUserByEmail) {
    throw new ConflictError("A user with this email already exists.");
  }

  if (phone) {
    const existingUserByPhone = await prisma.user.findUnique({
      where: { phone },
    });

    if (existingUserByPhone) {
      throw new ConflictError("A user with this phone number already exists.");
    }
  }

  const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

  const newUser = await prisma.user.create({
    data: {
      firstName,
      lastName,
      email,
      password: hashedPassword,
      phone: phone || null,
      role: role || "USER",
      profilePicture: profilePicture || null,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      profilePicture: true,
      phone: true,
      faceScan: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  res.status(HTTP_STATUS_CODES.CREATED || 201).json({
    message: "User created successfully.",
    data: newUser,
  });
});

export const addUser = [
  validationMiddleware.create(addUserValidation),
  handleAddUser,
];

export const updateUserProfile = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;
  const currentUserId = req.user?.id;
  const currentUserRole = req.user?.role;
  const userDetails = req.body;

  if (!userId || isNaN(parseInt(userId))) {
    throw new ValidationError("Valid user ID is required.");
  }

  const targetUserId = parseInt(userId);

  if (
    targetUserId !== parseInt(currentUserId?.toString() || "0") &&
    currentUserRole !== "ADMIN"
  ) {
    throw new UnauthorizedError(
      "Only admins can update other users' profiles."
    );
  }

  const existingUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { profilePicture: true, email: true, phone: true },
  });

  if (!existingUser) {
    throw new NotFoundError("User not found.");
  }

  if (userDetails.email && userDetails.email !== existingUser.email) {
    const existingUserByEmail = await prisma.user.findUnique({
      where: { email: userDetails.email },
    });

    if (existingUserByEmail && existingUserByEmail.id !== targetUserId) {
      throw new ConflictError("A user with this email already exists.");
    }
  }

  if (userDetails.phone && userDetails.phone !== existingUser.phone) {
    const existingUserByPhone = await prisma.user.findUnique({
      where: { phone: userDetails.phone },
    });

    if (existingUserByPhone && existingUserByPhone.id !== targetUserId) {
      throw new ConflictError("A user with this phone number already exists.");
    }
  }

  const updateData = {};
  if (userDetails.firstName !== undefined)
    updateData.firstName = userDetails.firstName;
  if (userDetails.lastName !== undefined)
    updateData.lastName = userDetails.lastName;
  if (userDetails.email !== undefined) updateData.email = userDetails.email;
  if (userDetails.phone !== undefined) updateData.phone = userDetails.phone;

  const updatedUser = await prisma.user.update({
    where: { id: targetUserId },
    data: updateData,
  });

  const { password, ...userWithoutPassword } = updatedUser;

  res.status(HTTP_STATUS_CODES.OK).json({
    message: "Profile updated successfully.",
    data: userWithoutPassword,
  });
});

export const updateUserRole = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;
  const { role } = req.body;

  if (!userId || isNaN(parseInt(userId))) {
    throw new ValidationError("Valid user ID is required.");
  }

  if (!["ADMIN", "USER"].includes(role)) {
    throw new ValidationError("Invalid role. Must be ADMIN or USER.");
  }

  if (req.user.id === parseInt(userId)) {
    throw new ForbiddenError("You cannot update your own role.");
  }

  const user = await prisma.user.findUnique({
    where: { id: parseInt(userId) },
  });

  if (!user) {
    throw new NotFoundError("User not found.");
  }

  if (user.role === role) {
    throw new BadRequestError(`User already has the role: ${role}`);
  }

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
      phone: true,
      faceScan: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return res.status(200).json({
    message: "User role updated successfully.",
    data: updatedUser,
  });
});

// Get User By ID
export const getUserById = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;
  const currentUserId = req.user.id;
  const currentUserRole = req.user.role;

  if (!userId || isNaN(parseInt(userId))) {
    throw new ValidationError("Valid user ID is required");
  }

  const targetUserId = parseInt(userId);

  if (
    targetUserId !== parseInt(currentUserId?.toString() || "0") &&
    currentUserRole !== "ADMIN"
  ) {
    throw new UnauthorizedError(
      "Only admins can access other users' profiles."
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: parseInt(userId) },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      profilePicture: true,
      phone: true,
      faceScan: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!user) {
    throw new NotFoundError("User not found.");
  }

  return res.status(HTTP_STATUS_CODES.OK || 200).json({
    message: "User fetched successfully.",
    data: user,
  });
});

export const getAllUsers = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const role = req.query.role;
  const search = req.query.search;

  const whereClause = {};

  if (role) {
    whereClause.role = role;
  }

  if (search) {
    whereClause.OR = [
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { phoneNumber: { contains: search, mode: "insensitive" } },
    ];
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where: whereClause,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        profilePicture: true,
        phone: true,
        faceScan: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.user.count({ where: whereClause }),
  ]);

  if (users.length === 0) {
    return res.status(200).json({
      message: "There are no users at the moment.",
      data: [],
      meta: {
        total: 0,
        page,
        limit,
        totalPages: 0,
      },
    });
  }

  return res.status(200).json({
    message: "Users successfully fetched.",
    data: users,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
});

export const deleteUser = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;

  if (!userId || isNaN(parseInt(userId))) {
    throw new ValidationError("Valid user ID is required.");
  }

  const user = await prisma.user.findUnique({
    where: { id: parseInt(userId) },
  });

  if (!user) {
    throw new NotFoundError("User not found.");
  }

  const targetUserId = parseInt(userId);

  if (targetUserId === parseInt(req.user.id?.toString() || "0")) {
    if (user.role === "ADMIN") {
      throw new ForbiddenError("Admins cannot delete themselves");
    }
  }

  await prisma.user.delete({
    where: { id: parseInt(id) },
  });

  return res.status(200).json({
    message: "User deleted successfully.",
  });
});

// Delete All Users
export const deleteAllUsers = asyncHandler(async (req, res, next) => {
  const currentUserId = req.user.id;

  const userCount = await prisma.user.count();

  if (userCount === 0) {
    return res.status(HTTP_STATUS_CODES.OK || 200).json({
      message: "No users to delete.",
      data: {
        deletedCount: 0,
      },
    });
  }

  const result = await prisma.user.deleteMany({
    where: {
      id: {
        not: parseInt(currentUserId?.toString() || "0"),
      },
    },
  });

  return res.status(HTTP_STATUS_CODES.OK || 200).json({
    message: "All users deleted successfully (except your own account).",
    data: {
      deletedCount: result.count,
    },
  });
});

// src/controllers/users.js
//
// Thin HTTP adapters over the user services: parse/validate input, call a
// service, shape the { message, data, meta? } envelope.
import {
  asyncHandler,
  ValidationError,
  UnauthorizedError,
} from "../middleware/error-handler.js";
import { HTTP_STATUS_CODES } from "../config/constants.js";
import { validationMiddleware } from "../validation/validation-error-handler.js";
import {
  addUserValidation,
  changePasswordValidation,
  updateUserProfileValidation,
} from "../validation/users-validation.js";
import { parsePagination, paginationMeta } from "../utils/pagination.js";
import { assertAttendant } from "../utils/authorization.js";
import * as userService from "../services/user.service.js";
import * as userQueryService from "../services/user-query.service.js";

const parseUserId = (userId, message = "Valid user ID is required.") => {
  if (!userId || isNaN(parseInt(userId))) {
    throw new ValidationError(message);
  }
  return parseInt(userId);
};

const handleAddUser = asyncHandler(async (req, res, _next) => {
  const { firstName, lastName, email, phone } = req.body;

  const data = await userService.createUser({
    firstName,
    lastName,
    email,
    phone,
  });

  res.status(HTTP_STATUS_CODES.CREATED).json({
    message: "User created successfully.",
    data,
  });
});

export const addUser = [
  validationMiddleware.create(addUserValidation),
  handleAddUser,
];

const handleUpdateUserProfile = asyncHandler(async (req, res, _next) => {
  const targetUserId = parseUserId(req.params.userId);

  const data = await userService.updateUserProfile(
    req.user,
    targetUserId,
    req.body
  );

  res.status(HTTP_STATUS_CODES.OK).json({
    message: "Profile updated successfully.",
    data,
  });
});

export const updateUserProfile = [
  validationMiddleware.create(updateUserProfileValidation),
  handleUpdateUserProfile,
];


export const getUserById = asyncHandler(async (req, res, _next) => {
  const targetUserId = parseUserId(
    req.params.userId,
    "Valid user ID is required"
  );

  const data = await userQueryService.getUserById(req.user, targetUserId);

  res.status(HTTP_STATUS_CODES.OK).json({
    message: "User fetched successfully.",
    data,
  });
});

export const getAllUsers = asyncHandler(async (req, res, _next) => {
  const { page, limit, skip } = parsePagination(req.query);

  const { users, total } = await userQueryService.listUsers({
    skip,
    limit,
    search: req.query.search,
  });

  if (users.length === 0) {
    return res.status(HTTP_STATUS_CODES.OK).json({
      message: "There are no users at the moment.",
      data: [],
      meta: paginationMeta(0, page, limit),
    });
  }

  return res.status(HTTP_STATUS_CODES.OK).json({
    message: "Users successfully fetched.",
    data: users,
    meta: paginationMeta(total, page, limit),
  });
});

export const deleteUser = asyncHandler(async (req, res, _next) => {
  const targetUserId = parseUserId(req.params.userId);

  await userService.softDeleteUser(req.user, targetUserId);

  res.status(HTTP_STATUS_CODES.OK).json({
    message: "User deleted successfully.",
  });
});

const handleChangePassword = asyncHandler(async (req, res, _next) => {
  assertAttendant(req.user, "Admins change their password at /admins/change-password.");
  const userId = req.user?.id;
  const { currentPassword, newPassword } = req.body;

  // Typed errors carry their own status; a plain `throw new Error` would be
  // formatted as a 500 by the central handler regardless of res.status().
  if (!userId) {
    throw new UnauthorizedError("Unauthorized - user not logged in");
  }

  await userService.changePassword(userId, currentPassword, newPassword);

  res.status(HTTP_STATUS_CODES.OK).json({
    message: "Password updated successfully",
  });
});

export const changePassword = [
  ...validationMiddleware.create(changePasswordValidation),
  handleChangePassword,
];

export const updateProfilePicture = asyncHandler(async (req, res, _next) => {
  const targetUserId = parseUserId(req.params.userId);

  const data = await userService.updateProfilePicture(
    req.user,
    targetUserId,
    req.file
  );

  res.status(HTTP_STATUS_CODES.OK).json({
    message: "Profile picture updated successfully.",
    data,
  });
});

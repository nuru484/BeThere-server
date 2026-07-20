// src/controllers/admins.js
import { asyncHandler, ValidationError } from "../middleware/error-handler.js";
import { HTTP_STATUS_CODES } from "../config/constants.js";
import { validationMiddleware } from "../validation/validation-error-handler.js";
import {
  adminChangePasswordValidation,
  createAdminValidation,
  updateUserProfileValidation,
} from "../validation/users-validation.js";
import { parsePagination, paginationMeta } from "../utils/pagination.js";
import * as adminService from "../services/admin.service.js";

const parseAdminId = (adminId) => {
  if (!adminId || isNaN(parseInt(adminId))) {
    throw new ValidationError("Valid admin ID is required.");
  }
  return parseInt(adminId);
};

const handleCreateAdmin = asyncHandler(async (req, res, _next) => {
  const data = await adminService.createAdmin(req.body);
  res.status(HTTP_STATUS_CODES.CREATED).json({
    message: "Admin created successfully.",
    data,
  });
});

export const createAdmin = [
  validationMiddleware.create(createAdminValidation),
  handleCreateAdmin,
];

export const getAllAdmins = asyncHandler(async (req, res, _next) => {
  const { page, limit, skip } = parsePagination(req.query);
  const { admins, total } = await adminService.listAdmins({ skip, limit });

  res.status(HTTP_STATUS_CODES.OK).json({
    message: "Admins successfully fetched.",
    data: admins,
    meta: paginationMeta(total, page, limit),
  });
});

export const getAdminById = asyncHandler(async (req, res, _next) => {
  const targetAdminId = parseAdminId(req.params.adminId);

  const data = await adminService.getAdminById(targetAdminId);

  res.status(HTTP_STATUS_CODES.OK).json({
    message: "Admin fetched successfully.",
    data,
  });
});

const handleUpdateAdminProfile = asyncHandler(async (req, res, _next) => {
  const targetAdminId = parseAdminId(req.params.adminId);

  const data = await adminService.updateAdminProfile(
    req.user,
    targetAdminId,
    req.body
  );

  res.status(HTTP_STATUS_CODES.OK).json({
    message: "Profile updated successfully.",
    data,
  });
});

// The profile fields are identical across principals, so the users
// validation is reused; the uniqueness checks live in the admin service.
export const updateAdminProfile = [
  validationMiddleware.create(updateUserProfileValidation),
  handleUpdateAdminProfile,
];

export const updateAdminProfilePicture = asyncHandler(
  async (req, res, _next) => {
    const targetAdminId = parseAdminId(req.params.adminId);

    const data = await adminService.updateAdminProfilePicture(
      req.user,
      targetAdminId,
      req.file
    );

    res.status(HTTP_STATUS_CODES.OK).json({
      message: "Profile picture updated successfully.",
      data,
    });
  }
);

export const deleteAdmin = asyncHandler(async (req, res, _next) => {
  const targetAdminId = parseAdminId(req.params.adminId);

  await adminService.deleteAdmin(req.user, targetAdminId);

  res.status(HTTP_STATUS_CODES.OK).json({ message: "Admin deleted successfully." });
});

const handleChangeAdminPassword = asyncHandler(async (req, res, _next) => {
  await adminService.changeAdminPassword(
    req.user.id,
    req.body.currentPassword,
    req.body.newPassword
  );
  res.status(HTTP_STATUS_CODES.OK).json({
    message: "Password changed successfully. Please log in again.",
  });
});

export const changeAdminPassword = [
  validationMiddleware.create(adminChangePasswordValidation),
  handleChangeAdminPassword,
];

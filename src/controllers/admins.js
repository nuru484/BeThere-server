// src/controllers/admins.js
import { asyncHandler, ValidationError } from "../middleware/error-handler.js";
import { HTTP_STATUS_CODES } from "../config/constants.js";
import { validationMiddleware } from "../validation/validation-error-handler.js";
import { addUserValidation, changePasswordValidation } from "../validation/users-validation.js";
import { parsePagination, paginationMeta } from "../utils/pagination.js";
import * as adminService from "../services/admin.service.js";

const handleCreateAdmin = asyncHandler(async (req, res, _next) => {
  const data = await adminService.createAdmin(req.body);
  res.status(HTTP_STATUS_CODES.CREATED).json({
    message: "Admin created successfully.",
    data,
  });
});

export const createAdmin = [
  validationMiddleware.create(addUserValidation),
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

export const deleteAdmin = asyncHandler(async (req, res, _next) => {
  const { adminId } = req.params;
  if (!adminId || isNaN(parseInt(adminId))) {
    throw new ValidationError("Valid admin ID is required.");
  }

  await adminService.deleteAdmin(req.user, parseInt(adminId));

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
  validationMiddleware.create(changePasswordValidation),
  handleChangeAdminPassword,
];

import { body } from "express-validator";

export const addUserValidation = [
  body("firstName")
    .exists({ checkFalsy: true })
    .withMessage("First name is required")
    .isLength({ min: 2, max: 100 })
    .withMessage("First name must be at least 2 characters long")
    .trim()
    .escape(),

  body("lastName")
    .exists({ checkFalsy: true })
    .withMessage("Last name is required")
    .isLength({ min: 2, max: 100 })
    .withMessage("Last name must be at least 2 characters long")
    .trim()
    .escape(),

  body("email")
    .exists({ checkFalsy: true })
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Invalid email format")
    .normalizeEmail(),

  body("password")
    .exists({ checkFalsy: true })
    .withMessage("Password is required")
    .isLength({ min: 4 })
    .withMessage("Password must be at least 4 characters long")
    .trim(),

  body("phone")
    .optional({ nullable: true })
    .isMobilePhone()
    .withMessage("Invalid phone number"),

  body("role")
    .optional()
    .isIn(["ADMIN", "USER"])
    .withMessage("Role must be either ADMIN or USER"),
];

export const updateUserProfileValidation = [
  body("firstName")
    .optional({ nullable: true })
    .isLength({ min: 2, max: 100 })
    .withMessage("First name must be at least 2 characters long")
    .trim()
    .escape(),

  body("lastName")
    .optional({ nullable: true })
    .isLength({ min: 2, max: 100 })
    .withMessage("Last name must be at least 2 characters long")
    .trim()
    .escape(),

  body("email")
    .optional({ nullable: true })
    .isEmail()
    .withMessage("Invalid email format")
    .normalizeEmail(),

  body("phone")
    .optional({ nullable: true })
    .isMobilePhone()
    .withMessage("Invalid phone number"),
];

export const changePasswordValidation = [
  body("currentPassword")
    .exists({ checkFalsy: true })
    .withMessage("Current password is required")
    .isLength({ min: 4, max: 255 })
    .withMessage("Current password must be at least 4 characters long")
    .trim(),

  body("newPassword")
    .exists({ checkFalsy: true })
    .withMessage("New password is required")
    .isLength({ min: 6, max: 255 })
    .withMessage("New password must be at least 6 characters long")
    .matches(/[A-Z]/)
    .withMessage("New password must contain at least one uppercase letter")
    .matches(/[a-z]/)
    .withMessage("New password must contain at least one lowercase letter")
    .matches(/[0-9]/)
    .withMessage("New password must contain at least one number")
    .matches(/[^A-Za-z0-9]/)
    .withMessage("New password must contain at least one special character")
    .trim(),
];

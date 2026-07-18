import { body } from "express-validator";
import { passwordRule } from "./password-rules.js";

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

  passwordRule("password"),

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
    .withMessage("Current password is required"),

  passwordRule("newPassword"),
];

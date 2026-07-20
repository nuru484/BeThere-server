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

  // No password on creation: admin-created attendants start passwordless
  // and sign in via the OTP flow. Reject the field outright so stale
  // clients fail loudly instead of silently dropping a credential.
  body("password")
    .not()
    .exists()
    .withMessage(
      "Users are created without a password - they sign in with a one-time code."
    ),

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
  // Optional here: passwordless (OTP-only) accounts set their first password
  // without one. The service requires and verifies it whenever the account
  // already has a password.
  body("currentPassword").optional(),

  passwordRule("newPassword"),
];

import { body } from "express-validator";
import { passwordRule } from "./password-rules.js";

const firstNameRule = body("firstName")
  .exists({ checkFalsy: true })
  .withMessage("First name is required")
  .isLength({ min: 2, max: 100 })
  .withMessage("First name must be at least 2 characters long")
  .trim()
  .escape();

const lastNameRule = body("lastName")
  .exists({ checkFalsy: true })
  .withMessage("Last name is required")
  .isLength({ min: 2, max: 100 })
  .withMessage("Last name must be at least 2 characters long")
  .trim()
  .escape();

const emailRule = body("email")
  .exists({ checkFalsy: true })
  .withMessage("Email is required")
  .isEmail()
  .withMessage("Invalid email format")
  .normalizeEmail();

const phoneRule = body("phone")
  .optional({ nullable: true })
  .isMobilePhone()
  .withMessage("Invalid phone number");

// Attendants only. They are created passwordless (OTP sign-in), so the
// password field is rejected outright; the service ignores any role, so it is
// not accepted here (an ADMIN is created via the dedicated admin endpoint).
export const addUserValidation = [
  firstNameRule,
  lastNameRule,
  emailRule,
  body("password")
    .not()
    .exists()
    .withMessage(
      "Users are created without a password - they sign in with a one-time code."
    ),
  phoneRule,
];

// Admins are created WITH a password (staff sign in with password + optional
// 2FA). This is a distinct contract from attendant creation.
export const createAdminValidation = [
  firstNameRule,
  lastNameRule,
  emailRule,
  passwordRule("password"),
  phoneRule,
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

// Attendant self-service change: currentPassword is optional because a
// passwordless (OTP-only) account sets its first password without one. The
// service still requires it whenever the account already has a password.
export const changePasswordValidation = [
  body("currentPassword").optional(),
  passwordRule("newPassword"),
];

// Admin self-service change: admins ALWAYS have a password, so the current one
// is required here (the service also enforces it - defense in depth).
export const adminChangePasswordValidation = [
  body("currentPassword")
    .exists({ checkFalsy: true })
    .withMessage("Current password is required."),
  passwordRule("newPassword"),
];

import { body } from "express-validator";

export const loginValidation = [
  body("email")
    .exists({ checkFalsy: true })
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Invalid email format")
    .normalizeEmail(),

  // No trim/escape here: passwords are compared against the stored hash, and
  // registration doesn't sanitize - escaping at login would break any
  // password containing & < > ' " forever.
  body("password")
    .exists({ checkFalsy: true })
    .withMessage("Password is required"),
];

/** Identifier for OTP login: a phone number or an email. */
export const otpRequestValidation = [
  body("identifier")
    .exists({ checkFalsy: true })
    .withMessage("Phone number or email is required")
    .isLength({ max: 255 })
    .trim(),
];

export const otpVerifyValidation = [
  ...otpRequestValidation,
  body("code")
    .exists({ checkFalsy: true })
    .withMessage("Code is required")
    .matches(/^[0-9]{6}$/)
    .withMessage("Code must be 6 digits"),
];

export const twoFactorCodeValidation = [
  body("code")
    .exists({ checkFalsy: true })
    .withMessage("Code is required")
    .matches(/^[0-9]{6}$/)
    .withMessage("Code must be 6 digits"),
];

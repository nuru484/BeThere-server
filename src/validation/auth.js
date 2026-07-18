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

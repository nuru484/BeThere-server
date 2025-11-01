import { body } from "express-validator";

export const loginValidation = [
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
    .trim()
    .escape(),
];

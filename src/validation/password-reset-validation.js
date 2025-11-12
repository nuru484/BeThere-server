import { body } from "express-validator";
import { query } from "express-validator";

export const requestPasswordResetValidation = [
  body("email")
    .exists({ checkFalsy: true })
    .withMessage("Email is required.")
    .isEmail()
    .withMessage("Please provide a valid email address.")
    .normalizeEmail(),
];

export const verifyResetTokenValidation = [
  query("token")
    .exists({ checkFalsy: true })
    .withMessage("Reset token is required.")
    .isLength({ min: 64, max: 64 })
    .withMessage("Invalid token format."),
];

export const resetPasswordValidation = [
  body("token")
    .exists({ checkFalsy: true })
    .withMessage("Reset token is required.")
    .isLength({ min: 64, max: 64 })
    .withMessage("Invalid token format."),

  body("newPassword")
    .exists({ checkFalsy: true })
    .withMessage("New password is required.")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters long."),

  body("confirmPassword")
    .exists({ checkFalsy: true })
    .withMessage("Password confirmation is required.")
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error("Passwords do not match.");
      }
      return true;
    }),
];

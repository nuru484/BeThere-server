import { body } from "express-validator";
import { passwordRule } from "./password-rules.js";

export const requestPasswordResetValidation = [
  body("email")
    .exists({ checkFalsy: true })
    .withMessage("Email is required.")
    .isEmail()
    .withMessage("Please provide a valid email address.")
    .normalizeEmail(),
];

// Token travels in the BODY (not the query string) so it never lands in access
// logs via the request URL.
export const verifyResetTokenValidation = [
  body("token")
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

  passwordRule("newPassword"),

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

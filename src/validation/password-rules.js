// src/validation/password-rules.js
import { body } from "express-validator";

/**
 * THE password policy, used everywhere a password is set (registration,
 * change, reset) so no surface drifts: at least 8 characters with an
 * uppercase letter, a lowercase letter, and a digit. Never trim/escape a
 * password field - sanitizing alters the credential before hashing/compare.
 */
export const passwordRule = (field = "password") =>
  body(field)
    .exists({ checkFalsy: true })
    .withMessage("Password is required")
    .isLength({ min: 8, max: 255 })
    .withMessage("Password must be at least 8 characters long")
    .matches(/[A-Z]/)
    .withMessage("Password must contain at least one uppercase letter")
    .matches(/[a-z]/)
    .withMessage("Password must contain at least one lowercase letter")
    .matches(/[0-9]/)
    .withMessage("Password must contain at least one number");

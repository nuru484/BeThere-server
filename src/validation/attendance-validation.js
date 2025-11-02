import { body } from "express-validator";

export const createAttendanceValidation = [
  body("latitude")
    .exists({ checkFalsy: true })
    .withMessage("Latitude is required.")
    .isFloat({ min: -90, max: 90 })
    .withMessage("Latitude must be a number between -90 and 90.")
    .toFloat(),

  body("longitude")
    .exists({ checkFalsy: true })
    .withMessage("Longitude is required.")
    .isFloat({ min: -180, max: 180 })
    .withMessage("Longitude must be a number between -180 and 180.")
    .toFloat(),
];

export const updateAttendanceValidation = [
  body("latitude")
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage("Latitude must be a number between -90 and 90.")
    .toFloat(),

  body("longitude")
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage("Longitude must be a number between -180 and 180.")
    .toFloat(),
];

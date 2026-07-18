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

  // The captured face-api descriptor: verification runs server-side against
  // the enrolled descriptor, so check-in cannot be faked by skipping the
  // camera flow.
  body("faceDescriptor")
    .exists()
    .withMessage("Face descriptor is required.")
    .isArray({ min: 128, max: 128 })
    .withMessage("Face descriptor must be an array of 128 numbers."),
  body("faceDescriptor.*")
    .isFloat()
    .withMessage("Face descriptor must contain only numbers.")
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

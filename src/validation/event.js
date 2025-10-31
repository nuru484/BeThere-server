import { body } from "express-validator";
import handleValidationErrors from "./validationErrorHandler.js";

const eventValidationValidators = [
  body("title")
    .exists({ checkFalsy: true })
    .withMessage("Event title is required.")
    .trim()
    .escape(),

  body("description")
    .optional()
    .isString()
    .withMessage("Description must be a string if provided.")
    .trim()
    .escape(),

  body("date")
    .exists({ checkFalsy: true })
    .withMessage("Event date is required.")
    .isISO8601()
    .withMessage("Date must be a valid date in ISO format.")
    .toDate(),

  body("location")
    .exists({ checkFalsy: true })
    .withMessage("Event location is required.")
    .isString()
    .withMessage("Location must be a string.")
    .trim()
    .escape(),

  body("category")
    .optional()
    .isString()
    .withMessage("Category must be a string if provided.")
    .trim()
    .escape(),
];

export const validateEventDetails = [
  ...eventValidationValidators,
  handleValidationErrors,
];

const eventUpdateValidators = [
  body("title")
    .optional()
    .isString()
    .withMessage("Event title must be a string if provided.")
    .trim()
    .escape(),

  body("description")
    .optional()
    .isString()
    .withMessage("Description must be a string if provided.")
    .trim()
    .escape(),

  body("date")
    .optional()
    .isISO8601()
    .withMessage("Date must be a valid date in ISO format if provided.")
    .toDate(),

  body("location")
    .optional()
    .isString()
    .withMessage("Location must be a string if provided.")
    .trim()
    .escape(),

  body("category")
    .optional()
    .isString()
    .withMessage("Category must be a string if provided.")
    .trim()
    .escape(),
];

export const validateEventUpdateDetails = [
  ...eventUpdateValidators,
  handleValidationErrors,
];

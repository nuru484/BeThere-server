import { body } from "express-validator";

export const createEventValidation = [
  body("title")
    .exists({ checkFalsy: true })
    .withMessage("Event title is required.")
    .trim()
    .isLength({ max: 255 })
    .withMessage("Event title must not exceed 255 characters.")
    .escape(),

  body("description")
    .optional()
    .isString()
    .withMessage("Description must be a string.")
    .trim()
    .isLength({ max: 500 })
    .withMessage("Event description must not exceed 500 characters.")
    .escape(),

  body("startDate")
    .exists({ checkFalsy: true })
    .withMessage("Event start date is required.")
    .isISO8601()
    .withMessage("Start date must be a valid date in ISO format.")
    .toDate(),

  body("endDate")
    .optional()
    .isISO8601()
    .withMessage("End date must be a valid date in ISO format.")
    .toDate(),

  body("startTime")
    .exists({ checkFalsy: true })
    .withMessage("Start time is required.")
    .isString()
    .withMessage("Start time must be a string.")
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage("Start time must be in HH:MM format (e.g., 06:00)."),

  body("endTime")
    .exists({ checkFalsy: true })
    .withMessage("End time is required.")
    .isString()
    .withMessage("End time must be a string.")
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage("End time must be in HH:MM format (e.g., 19:30)."),

  body("isRecurring")
    .optional()
    .isBoolean()
    .withMessage("isRecurring must be a boolean.")
    .toBoolean(),

  body("recurrenceInterval")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Recurrence interval must be a positive integer.")
    .toInt(),

  body("durationDays")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Duration days must be a positive integer.")
    .toInt(),

  body("type")
    .exists({ checkFalsy: true })
    .withMessage("Event type is required.")
    .isString()
    .withMessage("Type must be a string.")
    .trim()
    .escape(),

  body("location")
    .exists({ checkFalsy: true })
    .withMessage("Event location is required.")
    .isObject()
    .withMessage("Location must be a JSON object."),

  body("location.name")
    .exists({ checkFalsy: true })
    .withMessage("Location name is required.")
    .isString()
    .withMessage("Location name must be a string.")
    .trim()
    .isLength({ max: 255 })
    .withMessage("Location name must not exceed 255 characters."),

  body("location.latitude")
    .exists({ checkFalsy: true })
    .withMessage("Location latitude is required.")
    .isFloat({ min: -90, max: 90 })
    .withMessage("Latitude must be a valid number between -90 and 90."),

  body("location.longitude")
    .exists({ checkFalsy: true })
    .withMessage("Location longitude is required.")
    .isFloat({ min: -180, max: 180 })
    .withMessage("Longitude must be a valid number between -180 and 180."),

  body("location.city")
    .optional()
    .isString()
    .withMessage("City must be a string if provided.")
    .trim()
    .isLength({ max: 100 })
    .withMessage("City name must not exceed 100 characters."),

  body("location.country")
    .optional()
    .isString()
    .withMessage("Country must be a string if provided.")
    .trim()
    .isLength({ max: 100 })
    .withMessage("Country name must not exceed 100 characters."),
];

export const updateEventValidation = [
  body("title")
    .optional()
    .isString()
    .trim()
    .isLength({ max: 255 })
    .withMessage("Event title must not exceed 255 characters.")
    .escape(),

  body("description")
    .optional()
    .isString()
    .trim()
    .isLength({ max: 500 })
    .withMessage("Event description must not exceed 500 characters.")
    .escape(),

  body("startDate")
    .optional()
    .isISO8601()
    .withMessage("Start date must be a valid ISO date.")
    .toDate(),

  body("endDate")
    .optional()
    .isISO8601()
    .withMessage("End date must be a valid ISO date.")
    .toDate(),

  body("startTime")
    .optional()
    .isString()
    .withMessage("Start time must be a string.")
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage("Start time must be in HH:MM format (e.g., 06:00)."),

  body("endTime")
    .optional()
    .isString()
    .withMessage("End time must be a string.")
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage("End time must be in HH:MM format (e.g., 19:30)."),

  body("isRecurring")
    .optional()
    .isBoolean()
    .withMessage("isRecurring must be a boolean.")
    .toBoolean(),

  body("recurrenceInterval")
    .optional()
    .isInt({ min: 1 })
    .withMessage("recurrenceInterval must be a positive integer.")
    .toInt(),

  body("durationDays")
    .optional()
    .isInt({ min: 1 })
    .withMessage("durationDays must be a positive integer.")
    .toInt(),

  body("type")
    .optional()
    .isString()
    .withMessage("Event type must be a string.")
    .trim()
    .escape(),

  body("location")
    .optional()
    .isObject()
    .withMessage("Location must be a JSON object."),

  body("location.name")
    .if(body("location").exists())
    .exists({ checkFalsy: true })
    .withMessage("Location name is required when location is provided.")
    .isString()
    .trim()
    .isLength({ max: 255 })
    .withMessage("Location name must not exceed 255 characters."),

  body("location.latitude")
    .if(body("location").exists())
    .exists({ checkFalsy: true })
    .withMessage("Latitude is required when location is provided.")
    .isFloat({ min: -90, max: 90 })
    .withMessage("Latitude must be between -90 and 90."),

  body("location.longitude")
    .if(body("location").exists())
    .exists({ checkFalsy: true })
    .withMessage("Longitude is required when location is provided.")
    .isFloat({ min: -180, max: 180 })
    .withMessage("Longitude must be between -180 and 180."),

  body("location.city")
    .optional()
    .isString()
    .trim()
    .isLength({ max: 100 })
    .withMessage("City must not exceed 100 characters."),

  body("location.country")
    .optional()
    .isString()
    .trim()
    .isLength({ max: 100 })
    .withMessage("Country must not exceed 100 characters."),
];

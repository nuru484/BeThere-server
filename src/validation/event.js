import { body } from "express-validator";
import { RECURRENCE_INTERVAL_MESSAGE } from "../config/constants.js";

// Event create/update accept BOTH plain JSON and multipart/form-data (the
// latter for the coverImage file). Under multipart every body value arrives
// as a string, so:
//   - location is JSON-ENCODED under multipart: clients send the same object
//     serialized with JSON.stringify. The sanitizer below parses the string
//     form back to an object before the object/nested validators run; JSON
//     clients pass through untouched.
//   - the scalar coercions already in place (.toDate/.toBoolean/.toInt after
//     isISO8601/isBoolean/isInt) validate on the stringified value, so
//     "true" and "3" coerce identically for both content types.
const parseJsonObject = (value) => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    // Leave the unparsable string in place: isObject() then reports it.
    return value;
  }
};

// coverImage travels as a FILE part; the body field exists only to carry the
// remove signal ('') on update. Any other string is rejected so clients can
// never write arbitrary URLs into the column.
const coverImageRemovalRule = body("coverImage")
  .optional()
  .custom((value) => value === "")
  .withMessage(
    "coverImage accepts only an empty string (remove). Send a file to replace it."
  );

// Stops a new bad recurrence config at the boundary (see the constant for
// why). The service repeats the check against the MERGED values, since a
// partial update can supply either half of the pair.
const isRecurringValue = (value) => value === true || value === "true";

// The daily window and the date range must be coherent, or the event is
// permanently un-checkable: an endTime before startTime means the window
// never opens ("not yet open" all morning, "closed" all evening), and an
// endDate before startDate yields a zero-session event. Checked here when
// both halves are in the body; the service re-checks the MERGED values on
// update, where either half may come from the existing row.
const timeWindowRule = body("endTime").custom((endTime, { req }) => {
  const startTime = req.body?.startTime;
  if (typeof startTime !== "string" || typeof endTime !== "string") return true;
  if (endTime <= startTime) {
    throw new Error("endTime must be after startTime.");
  }
  return true;
});

const dateRangeRule = body("endDate").custom((endDate, { req }) => {
  const startDate = req.body?.startDate;
  if (!startDate || !endDate) return true;
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return true;
  if (end < start) {
    throw new Error("endDate must be on or after startDate.");
  }
  return true;
});

const recurrenceIntervalRule = body("recurrenceInterval")
  .optional({ values: "falsy" })
  .custom((value, { req }) => {
    if (!isRecurringValue(req.body?.isRecurring)) return true;
    const durationDays = Number(req.body?.durationDays);
    if (!Number.isFinite(durationDays)) return true;
    if (Number(value) < durationDays) {
      throw new Error(RECURRENCE_INTERVAL_MESSAGE);
    }
    return true;
  });

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
    .optional({ values: "falsy" })
    .isISO8601()
    .withMessage("End date must be a valid date in ISO format.")
    .toDate(),

  body("startTime")
    .exists({ checkFalsy: true })
    .withMessage("Start time is required.")
    .isString()
    .withMessage("Start time must be a string.")
    .matches(/^([01][0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage("Start time must be in two-digit HH:MM format (e.g., 06:00)."),

  body("endTime")
    .exists({ checkFalsy: true })
    .withMessage("End time is required.")
    .isString()
    .withMessage("End time must be a string.")
    .matches(/^([01][0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage("End time must be in two-digit HH:MM format (e.g., 19:30)."),

  body("isRecurring")
    .optional()
    .isBoolean()
    .withMessage("isRecurring must be a boolean.")
    .toBoolean(),

  body("recurrenceInterval")
    .optional({ values: "falsy" })
    .isInt({ min: 1 })
    .withMessage("Recurrence interval must be a positive integer.")
    .toInt(),

  body("durationDays")
    .optional({ values: "falsy" })
    .isInt({ min: 1 })
    .withMessage("Duration days must be a positive integer.")
    .toInt(),

  recurrenceIntervalRule,
  timeWindowRule,
  dateRangeRule,

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
    .customSanitizer(parseJsonObject)
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
    .optional({ values: "falsy" })
    .isISO8601()
    .withMessage("End date must be a valid ISO date.")
    .toDate(),

  body("startTime")
    .optional()
    .isString()
    .withMessage("Start time must be a string.")
    .matches(/^([01][0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage("Start time must be in two-digit HH:MM format (e.g., 06:00)."),

  body("endTime")
    .optional()
    .isString()
    .withMessage("End time must be a string.")
    .matches(/^([01][0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage("End time must be in two-digit HH:MM format (e.g., 19:30)."),

  body("isRecurring")
    .optional()
    .isBoolean()
    .withMessage("isRecurring must be a boolean.")
    .toBoolean(),

  body("recurrenceInterval")
    .optional({ values: "falsy" })
    .isInt({ min: 1 })
    .withMessage("recurrenceInterval must be a positive integer.")
    .toInt(),

  body("durationDays")
    .optional({ values: "falsy" })
    .isInt({ min: 1 })
    .withMessage("durationDays must be a positive integer.")
    .toInt(),

  recurrenceIntervalRule,
  timeWindowRule,
  dateRangeRule,

  body("type")
    .optional()
    .isString()
    .withMessage("Event type must be a string.")
    .trim()
    .escape(),

  coverImageRemovalRule,

  body("location")
    .optional()
    .customSanitizer(parseJsonObject)
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

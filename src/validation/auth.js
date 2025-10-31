import { body } from "express-validator";
import handleValidationErrors from "./validation-error-handler.js";

const loginValidators = [
  body("username")
    .exists({ checkFalsy: true })
    .withMessage("You must type a username")
    .trim()
    .escape(),

  body("password")
    .exists({ checkFalsy: true })
    .withMessage("You must type a password")
    .trim()
    .escape(),
];

export default [...loginValidators, handleValidationErrors];

import { body } from "express-validator";

export const faceScanValidation = [
  body("faceScan")
    .exists({ checkFalsy: true })
    .withMessage("Face scan data is required")
    .isArray({ min: 128, max: 128 })
    .withMessage("Face scan must be an array of 128 descriptor values")
    .custom((value) => {
      const isValid = value?.every(
        (num) => typeof num === "number" && !isNaN(num)
      );
      if (!isValid) {
        throw new Error("Each face scan descriptor value must be a number");
      }
      return true;
    }),
];

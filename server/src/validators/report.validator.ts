import { body, type ValidationChain } from "express-validator";

export const reportValidators: ValidationChain[] = [
  body("ticker")
    .exists()
    .withMessage("ticker is required")
    .bail()
    .isString()
    .trim()
    .isLength({ min: 1, max: 20 })
    .withMessage("ticker must be a non-empty string"),
];

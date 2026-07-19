import { param, type ValidationChain } from "express-validator";

export const marketDataValidators: ValidationChain[] = [
  param("ticker")
    .exists()
    .withMessage("ticker path param is required")
    .bail()
    .isString()
    .trim()
    .isLength({ min: 1, max: 20 })
    .matches(/^[A-Za-z0-9.&-]+$/)
    .withMessage("ticker contains invalid characters"),
];

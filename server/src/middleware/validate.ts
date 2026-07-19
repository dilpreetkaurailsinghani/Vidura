import type { NextFunction, Request, Response } from "express";
import { validationResult, type ValidationChain } from "express-validator";

export function validate(chains: ValidationChain[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    await Promise.all(chains.map((chain) => chain.run(req)));

    const result = validationResult(req);
    if (!result.isEmpty()) {
      res.status(400).json({
        error: "Validation failed",
        details: result.array(),
      });
      return;
    }

    next();
  };
}

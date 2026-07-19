import type { NextFunction, Request, Response } from "express";

export function notFoundHandler(req: Request, res: Response, _next: NextFunction): void {
  res.status(404).json({
    error: "Not found",
    path: req.originalUrl,
  });
}

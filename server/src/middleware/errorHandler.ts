import type { NextFunction, Request, Response } from "express";
import { isHttpError } from "../utils/httpError";
import { isProduction } from "../config/env";
import { logger } from "../utils/logger";

// Express recognizes this as error-handling middleware purely by its arity
// (4 parameters), so all four parameters must stay declared even though
// `next` is unused in most branches.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    // Response (e.g. a stream) already started; delegate to Express's
    // default handler which will terminate the connection.
    next(err);
    return;
  }

  if (isHttpError(err)) {
    logger.warn(`${req.method} ${req.originalUrl} -> ${err.statusCode}`, {
      message: err.message,
      details: err.details,
    });
    res.status(err.statusCode).json({
      error: err.message,
      details: err.details,
    });
    return;
  }

  const error = err instanceof Error ? err : new Error("Unknown error");
  logger.error(`${req.method} ${req.originalUrl} -> 500`, {
    message: error.message,
    stack: isProduction() ? undefined : error.stack,
  });

  res.status(500).json({
    error: "Internal server error",
    ...(isProduction() ? {} : { message: error.message, stack: error.stack }),
  });
}

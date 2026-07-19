import path from "node:path";
import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";

import { env, isProduction } from "./config/env";
import apiRoutes from "./routes";
import { notFoundHandler } from "./middleware/notFoundHandler";
import { errorHandler } from "./middleware/errorHandler";
import { logger } from "./utils/logger";

export function createApp(): Express {
  const app = express();

  // Trust the first proxy hop (Railway/Render/other PaaS run behind a
  // load balancer); needed for correct req.ip / rate limiting / https detection.
  app.set("trust proxy", 1);

  app.use(
    helmet({
      // CSP is configured explicitly below rather than disabled entirely.
      // Allows Google Fonts and inline styles (Recharts/Radix) while still
      // providing protection against unknown external scripts.
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:", "https://storage.googleapis.com"],
          connectSrc: ["'self'"],
          workerSrc: ["'none'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  // CORS origin resolution:
  //   - Production: use CORS_ORIGIN env var (required). Falls back to denying
  //     all cross-origin requests (cors origin: false) if unset, which is safe.
  //   - Development: default to "*" so the Vite dev server can reach the API.
  const corsOriginValue = env.corsOrigin;
  let corsOrigin: cors.CorsOptions["origin"];
  if (corsOriginValue === "*") {
    corsOrigin = true; // allow any origin
  } else if (corsOriginValue) {
    corsOrigin = corsOriginValue.split(",").map((o) => o.trim());
  } else if (isProduction()) {
    // No CORS_ORIGIN set in production — deny cross-origin rather than
    // accidentally opening to all. Startup validator will also warn about this.
    corsOrigin = false;
  } else {
    // Development without CORS_ORIGIN — open to any origin for convenience.
    corsOrigin = true;
  }

  app.use(
    cors({
      origin: corsOrigin,
      credentials: true,
    }),
  );

  app.use(compression());

  app.use(
    morgan(isProduction() ? "combined" : "dev", {
      stream: { write: (message: string) => logger.info(message.trim()) },
    }),
  );

  // The chat/report bodies are small JSON payloads (chat history + ticker),
  // 1mb is generous headroom over what the frontend ever sends.
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));

  // ---- API ----
  app.use("/api", apiRoutes);

  // ---- Static SPA (client/dist) ----
  const clientDistPath = env.clientDistPath;
  app.use(express.static(clientDistPath));

  // Client-side routing fallback: any non-API, non-static GET request
  // serves the SPA shell so TanStack Router can take over on the client.
  app.get(/^(?!\/api).*/, (req, res, next) => {
    res.sendFile(path.join(clientDistPath, "index.html"), (err) => {
      if (err) next(err);
    });
  });

  // ---- 404 for anything under /api that didn't match a route ----
  app.use("/api", notFoundHandler);

  // ---- Global error handler (must be last) ----
  app.use(errorHandler);

  return app;
}

import { createApp } from "./app";
import { env, isProduction } from "./config/env";
import { logger } from "./utils/logger";

// ---------------------------------------------------------------------------
// Startup environment validation
// ---------------------------------------------------------------------------
// Validates environment variables before the server begins accepting
// requests. Only structurally invalid configuration (e.g. an unrecognized
// NODE_ENV) is treated as fatal. Missing optional integrations (the AI
// gateway key, an explicit CORS origin) are logged as warnings — the app
// already degrades gracefully at the request level for both, and a fresh
// deploy should come up serving the site even before every secret has
// been configured.
// ---------------------------------------------------------------------------

function validateEnv(): void {
  const errors: string[] = [];
  const warnings: string[] = [];

  // PORT — numeric, injected automatically by the hosting platform (Railway, Render, etc.).
  if (!env.port || env.port < 1 || env.port > 65535) {
    warnings.push("PORT is not a valid port number; defaulting to 4000.");
  }

  // NODE_ENV — must be a recognised value.
  if (!["development", "production", "test"].includes(env.nodeEnv)) {
    errors.push(`NODE_ENV="${env.nodeEnv}" is not valid. Must be development | production | test.`);
  }

  // LOVABLE_API_KEY — required for /api/chat and /api/report to function,
  // but NOT required for the server to boot or for the rest of the site
  // (frontend, health check, market data) to work. The controllers already
  // handle a missing key gracefully with a clean 500 JSON response, so this
  // is a warning rather than a boot-blocking error — a fresh Railway deploy
  // should not crash-loop the entire site just because the AI key hasn't
  // been added yet.
  if (!env.lovableApiKey) {
    warnings.push("LOVABLE_API_KEY is not set — /api/chat and /api/report will return 500 until it is configured.");
  }

  // AI_MODEL — should not be the known-invalid value.
  if (env.aiModel === "google/gemini-3-flash-preview") {
    warnings.push(
      'AI_MODEL is set to "google/gemini-3-flash-preview" which is invalid. ' +
      'Using "google/gemini-2.0-flash" as fallback.'
    );
  }

  // CORS_ORIGIN — recommended in production, but not required to boot.
  // app.ts already defaults to denying cross-origin requests (safe) when
  // this is unset, so the app still functions correctly for the standard
  // single-origin Railway deployment (Express serving both API and SPA
  // from the same domain, where CORS doesn't apply to same-origin calls).
  if (isProduction() && !env.corsOrigin) {
    warnings.push(
      "CORS_ORIGIN is not set in production. Cross-origin requests will be denied by default. " +
      "If your frontend is on a different origin (e.g., a separate Netlify deploy), " +
      "set CORS_ORIGIN to that domain."
    );
  }

  // Log all warnings.
  for (const w of warnings) {
    logger.warn(`[env] ${w}`);
  }

  // Log errors and exit in production; only warn in development.
  if (errors.length > 0) {
    for (const e of errors) {
      logger.error(`[env] MISSING OR INVALID: ${e}`);
    }
    if (isProduction()) {
      logger.error("[env] Startup aborted due to missing required environment variables.");
      process.exit(1);
    }
  }
}

validateEnv();

// ---------------------------------------------------------------------------
// Server startup
// ---------------------------------------------------------------------------

const app = createApp();

const server = app.listen(env.port, () => {
  logger.info(`Vidura API server listening on port ${env.port} (${env.nodeEnv})`);
  logger.info(`[env] AI model: ${env.aiModel}`);
  logger.info(`[env] CORS origin: ${env.corsOrigin ?? "(unset — cross-origin requests denied in prod)"}`);
});

function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down gracefully...`);
  server.close((err) => {
    if (err) {
      logger.error("Error during server shutdown", err);
      process.exit(1);
    }
    process.exit(0);
  });

  // Force-exit if graceful shutdown hangs.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", reason);
});

process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception", err);
  process.exit(1);
});

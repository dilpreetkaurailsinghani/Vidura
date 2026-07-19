import path from "node:path";
import dotenv from "dotenv";

// Load .env from the server package root regardless of the process's cwd
// (e.g. when started from the repo root via `npm start --workspace server`).
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// Overloaded helper: when a fallback is supplied the return is always `string`;
// when no fallback is supplied the return may be `undefined`.
function readString(name: string, fallback: string): string;
function readString(name: string): string | undefined;
function readString(name: string, fallback?: string): string | undefined {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return value;
}

function readNumber(name: string, fallback: number): number {
  const value = process.env[name];
  const parsed = value ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const env = {
  nodeEnv: readString("NODE_ENV", "development") as "development" | "production" | "test",
  port: readNumber("PORT", 4000),

  // AI Gateway (Lovable) — used by /api/chat and /api/report.
  // Optional: undefined triggers a 500 on the first request and a startup
  // warning (or hard exit in production — see server.ts validateEnv).
  lovableApiKey: readString("LOVABLE_API_KEY"),

  // Model identifier forwarded to the Lovable AI Gateway.
  // "google/gemini-3-flash-preview" was invalid (Gemini 3 does not exist).
  // Correct default: google/gemini-2.0-flash — a stable, supported model.
  // Override via AI_MODEL without a code deploy.
  aiModel: readString("AI_MODEL", "google/gemini-2.0-flash"),

  // Comma-separated list of allowed CORS origins.
  // In development defaults to "*" so the Vite dev server can call the API.
  // In production CORS_ORIGIN MUST be set explicitly — the startup validator
  // will warn loudly if it is not (and hard-exit if strict mode is enabled).
  corsOrigin: readString("CORS_ORIGIN"),

  // Where the built client SPA lives.
  clientDistPath: readString(
    "CLIENT_DIST_PATH",
    path.resolve(__dirname, "../../../client/dist"),
  ),

  // TTL (ms) for the in-memory market-data cache.
  marketDataCacheTtlMs: readNumber("MARKET_DATA_CACHE_TTL_MS", 5 * 60 * 1000),

  // Minimum log level. Any value outside the valid set silently falls back to
  // the environment default (info in production, debug in development).
  get logLevel(): "debug" | "info" | "warn" | "error" {
    const valid = ["debug", "info", "warn", "error"] as const;
    const raw = readString("LOG_LEVEL");
    if (raw && (valid as readonly string[]).includes(raw)) {
      return raw as "debug" | "info" | "warn" | "error";
    }
    // Default: suppress debug noise in production
    return process.env.NODE_ENV === "production" ? "info" : "debug";
  },
};

export function isProduction(): boolean {
  return env.nodeEnv === "production";
}

export function getAiGatewayApiKey(): string | undefined {
  return env.lovableApiKey;
}

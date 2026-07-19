import { env } from "../config/env";

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info:  20,
  warn:  30,
  error: 40,
};

// Reads the validated LOG_LEVEL from the env object (Fix 21).
// env.logLevel restricts values to the known set and applies a safe default,
// so no unsafe cast or silent-failure path exists here.
function getMinLevel(): LogLevel {
  return env.logLevel;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[getMinLevel()];
}

function format(level: LogLevel, message: string, meta?: unknown): string {
  const timestamp = new Date().toISOString();
  const base = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  if (meta === undefined) return base;
  try {
    return `${base} ${typeof meta === "string" ? meta : JSON.stringify(meta)}`;
  } catch {
    return `${base} [unserializable meta]`;
  }
}

function write(level: LogLevel, message: string, meta?: unknown) {
  if (!shouldLog(level)) return;
  const line = format(level, message, meta);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (message: string, meta?: unknown) => write("debug", message, meta),
  info:  (message: string, meta?: unknown) => write("info",  message, meta),
  warn:  (message: string, meta?: unknown) => write("warn",  message, meta),
  error: (message: string, meta?: unknown) => write("error", message, meta),
};

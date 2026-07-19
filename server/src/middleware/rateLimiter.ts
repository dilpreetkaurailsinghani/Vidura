import rateLimit from "express-rate-limit";

/**
 * Strict rate limiter for AI-powered endpoints (/api/chat, /api/report).
 * These routes call an external paid gateway; throttling prevents abuse and
 * runaway credit consumption.
 *
 * 10 requests per IP per minute is generous for interactive use but still
 * blocks automated abuse.  Override with AI_RATE_LIMIT_MAX env var.
 */
const aiRateLimitMax = process.env.AI_RATE_LIMIT_MAX
  ? parseInt(process.env.AI_RATE_LIMIT_MAX, 10)
  : 10;

export const aiRateLimiter = rateLimit({
  windowMs: 60_000, // 1 minute
  max: aiRateLimitMax,
  standardHeaders: true,  // Return rate-limit headers (RateLimit-*)
  legacyHeaders: false,   // Disable X-RateLimit-* legacy headers
  message: {
    error: "Too many requests. Please wait a minute and try again.",
  },
  // Skip rate-limiting in test environments
  skip: () => process.env.NODE_ENV === "test",
});

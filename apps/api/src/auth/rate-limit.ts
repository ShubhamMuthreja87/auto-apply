/**
 * Per-client rate limits (D26, D28): login (against password guessing) and
 * Run starts (against spending AI credit). Keyed by `req.ip`, which is the
 * real client only because `trust proxy` is set behind nginx.
 */
import { rateLimit } from "express-rate-limit";
import type { RequestHandler } from "express";
import { sendError } from "../send-error.js";

export interface RateLimits {
  /** Failed logins per client per 15 minutes. */
  login?: number;
  /** Run starts per client per hour. */
  runs?: number;
}

export const DEFAULT_RATE_LIMITS: Required<RateLimits> = { login: 10, runs: 10 };

function limiter(limit: number, windowMs: number, skipSuccessfulRequests: boolean): RequestHandler {
  return rateLimit({
    windowMs,
    limit,
    skipSuccessfulRequests,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, res) => {
      sendError(res, 429, "rate_limited", "Too many requests; try again later");
    },
  });
}

export function loginLimiter(limit: number): RequestHandler {
  // A successful login does not count: only guesses spend the budget.
  return limiter(limit, 15 * 60 * 1000, true);
}

export function runsLimiter(limit: number): RequestHandler {
  return limiter(limit, 60 * 60 * 1000, false);
}

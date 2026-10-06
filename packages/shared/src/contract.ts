import { z } from "zod";

/**
 * The contract between `apps/web` and `apps/api`: shared zod schemas and the
 * types inferred from them. This skeleton (ticket 01) holds the status state
 * machines (D16), the pipeline limits (D17), a shared error-response shape, and
 * the health-check payload used by the walking skeleton. Later tickets extend
 * it with the run, evaluation, posting and SSE event shapes.
 */

/**
 * Run status machine (D16): discovering → evaluating → applying → completed | failed.
 * Transitions only move forward; one function will own transitions in a later ticket.
 */
export const runStatusSchema = z.enum([
  "discovering",
  "evaluating",
  "applying",
  "completed",
  "failed",
]);
export type RunStatus = z.infer<typeof runStatusSchema>;

/**
 * Evaluation (per-job) status machine (D16):
 * queued → evaluating → blocked | skipped | held | applying → submitted | failed.
 * `submitted` is a simulated submit (D18). Each status carries a reason elsewhere.
 */
export const evaluationStatusSchema = z.enum([
  "queued",
  "evaluating",
  "blocked",
  "skipped",
  "held",
  "applying",
  "submitted",
  "failed",
]);
export type EvaluationStatus = z.infer<typeof evaluationStatusSchema>;

/** Pipeline limits (D17): at most 3 jobs in flight and 15 AI evaluations per run. */
export const MAX_IN_FLIGHT = 3;
export const MAX_AI_EVALS = 15;
export const LIMITS = {
  maxInFlight: MAX_IN_FLIGHT,
  maxAiEvals: MAX_AI_EVALS,
} as const;

/**
 * The single JSON error shape every API route returns on failure — never a
 * stack trace (CODING_STANDARDS, API section).
 */
export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

/** Health-check payload for the walking skeleton (`GET /api/health`). */
export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
  namespace: z.string(),
  time: z.string(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

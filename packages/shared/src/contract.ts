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

/**
 * Which `Repo` implementation the API is running on. `memory` is only ever
 * chosen explicitly and loses everything on restart (ADR-0004).
 */
export const repoKindSchema = z.enum(["firestore", "memory"]);
export type RepoKind = z.infer<typeof repoKindSchema>;

/**
 * Health-check payload (`GET /api/health`). It names the active repository and
 * namespace so an in-memory demo is never mistaken for a persistent one
 * (ADR-0004).
 */
export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
  namespace: z.string(),
  repo: repoKindSchema,
  time: z.string(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

/* -------------------------------------------------------------------------- *
 * Firestore documents (D14) and the identities built from them.
 *
 * These shapes travel to the browser over SSE as run and evaluation snapshots
 * (D21), so they live in the contract. Product-rich fields — the rubric inside
 * preferences (D6), the per-criterion evidence and built Greenhouse payload on
 * an Evaluation (D7, D18) — are owned by later tickets; this ticket fixes
 * identity, status and funnel, enough for the persistence port and its tests.
 * -------------------------------------------------------------------------- */

/** The ATS boards discovery reads from (D2). */
export const atsSchema = z.enum(["greenhouse", "lever", "ashby"]);
export type Ats = z.infer<typeof atsSchema>;

/**
 * Where a Posting's data came from (D3, ticket 06): `live` from the board's
 * public API; `fallback` from that board's recorded fixtures because the live
 * call failed; `fixture` from the recordings by choice (the fixtures-only job
 * source used for deterministic end-to-end runs). The UI labels anything that
 * is not `live`.
 */
export const postingSourceSchema = z.enum(["live", "fallback", "fixture"]);
export type PostingSource = z.infer<typeof postingSourceSchema>;

/**
 * A single job as returned by an ATS board, normalised into our own shape
 * (GLOSSARY: Posting). The unit of discovery. `remote` is parsed from the
 * board's location text; `remote` and `source` default for documents written
 * before ticket 06.
 */
export const postingSchema = z.object({
  ats: atsSchema,
  board: z.string(),
  jobId: z.string(),
  title: z.string(),
  company: z.string(),
  location: z.string(),
  descriptionText: z.string(),
  applyUrl: z.string().url(),
  remote: z.boolean().default(false),
  source: postingSourceSchema.default("live"),
});
export type Posting = z.infer<typeof postingSchema>;

/**
 * The stable identity of a Posting across the several URLs an ATS exposes for
 * it (GLOSSARY: Job Key, D14): `${ats}:${board}:${jobId}`. It is both the
 * Evaluation document id (within its Run) and the Seen key.
 */
export function jobKey(posting: Pick<Posting, "ats" | "board" | "jobId">): string {
  return `${posting.ats}:${posting.board}:${posting.jobId}`;
}

/**
 * The single user document (D13): profile, the preferences rubric (D6) and
 * settings. The detailed shapes of these three are owned by later tickets, so
 * here they are open records — the persistence port and its tests do not pin
 * down product fields yet.
 */
export const userDocSchema = z.object({
  uid: z.string(),
  profile: z.record(z.string(), z.unknown()),
  preferences: z.record(z.string(), z.unknown()),
  settings: z.record(z.string(), z.unknown()),
});
export type UserDoc = z.infer<typeof userDocSchema>;

/**
 * Per-run funnel counts (D16). They are only ever incremented, never
 * read-modify-written (CODING_STANDARDS landmine: lost updates); the Firestore
 * adapter maps increments to `FieldValue.increment`.
 */
export const runFunnelSchema = z.object({
  discovered: z.number().int().nonnegative(),
  evaluated: z.number().int().nonnegative(),
  blocked: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  held: z.number().int().nonnegative(),
  submitted: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});
export type RunFunnel = z.infer<typeof runFunnelSchema>;

/** A fresh, all-zero funnel for a newly created Run. */
export function emptyFunnel(): RunFunnel {
  return { discovered: 0, evaluated: 0, blocked: 0, skipped: 0, held: 0, submitted: 0, failed: 0 };
}

/**
 * One unattended pass of the pipeline (GLOSSARY: Run). `reason` is set when a
 * run ends `failed` (D16); timestamps are ISO-8601 strings.
 */
export const runSchema = z.object({
  runId: z.string(),
  uid: z.string(),
  status: runStatusSchema,
  funnel: runFunnelSchema,
  reason: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Run = z.infer<typeof runSchema>;

/**
 * A Run is active until it reaches a terminal status. This drives the
 * one-active-run-per-user rule (D17) that `createRun` enforces as a future 409.
 */
export function isRunActive(status: RunStatus): boolean {
  return status !== "completed" && status !== "failed";
}

/** The outcome the rubric assigns a Posting (GLOSSARY: Verdict, D8). */
export const verdictSchema = z.enum(["APPLY_NOW", "APPLY", "STRETCH", "BLOCKED"]);
export type Verdict = z.infer<typeof verdictSchema>;

/**
 * The per-run record of what we decided about one Posting (GLOSSARY:
 * Evaluation), stored as one document under its Run. Per-criterion evidence and
 * the built Greenhouse payload are added by the scoring and submit tickets.
 */
export const evaluationSchema = z.object({
  jobKey: z.string(),
  runId: z.string(),
  posting: postingSchema,
  status: evaluationStatusSchema,
  verdict: verdictSchema.nullable(),
  score: z.number().nullable(),
  reason: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Evaluation = z.infer<typeof evaluationSchema>;

/* -------------------------------------------------------------------------- *
 * Run API and the live stream (D21, ticket 05).
 * -------------------------------------------------------------------------- */

/** `POST /api/runs` → `202`: the Run was created and is running in the background. */
export const createRunResponseSchema = z.object({ runId: z.string() });
export type CreateRunResponse = z.infer<typeof createRunResponseSchema>;

/**
 * `GET /api/runs/active`: the user's active Run, if any, so a refreshed or new
 * tab can reattach to the live stream instead of losing it.
 */
export const activeRunResponseSchema = z.object({ run: runSchema.nullable() });
export type ActiveRunResponse = z.infer<typeof activeRunResponseSchema>;

/**
 * Named events on `GET /api/runs/:runId/events` (D21). Every connect starts
 * with one `snapshot`, then `run` / `eval` deltas carrying full documents, never
 * increments (ADR-0003); a terminal `run` is followed by `done` and the stream
 * ends. `error` reports a subscription failure instead of going quiet. There is
 * no `Last-Event-ID`: a reconnect simply re-snapshots.
 */
export const sseEventNameSchema = z.enum(["snapshot", "run", "eval", "done", "error"]);
export type SseEventName = z.infer<typeof sseEventNameSchema>;

/** The full current state on connect. Funnel counts are `run.funnel`. */
export const snapshotEventSchema = z.object({
  run: runSchema,
  evaluations: z.array(evaluationSchema),
});
export type SnapshotEvent = z.infer<typeof snapshotEventSchema>;

/** The latest Run document. */
export const runEventSchema = runSchema;
/** The latest version of one Evaluation; consumers keep the latest per Job Key. */
export const evalEventSchema = evaluationSchema;

/** Sent once, after the terminal `run` event, just before the stream ends. */
export const doneEventSchema = z.object({ runId: z.string(), status: runStatusSchema });
export type DoneEvent = z.infer<typeof doneEventSchema>;

/** A subscription failure surfaced on the stream, in the shared error shape. */
export const errorEventSchema = errorResponseSchema;

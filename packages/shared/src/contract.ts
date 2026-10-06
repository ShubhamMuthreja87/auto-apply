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
 * Auth (D26, ticket 15). One user, no signup; the session is a JWT in an
 * httpOnly cookie the browser never reads, so no payload carries the token.
 * -------------------------------------------------------------------------- */

/** `POST /api/login` body. Bounded so a huge password never reaches bcrypt. */
export const loginRequestSchema = z.object({
  username: z.string().min(1).max(200),
  password: z.string().min(1).max(200),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/**
 * `POST /api/login` (success) and `GET /api/session`: the cookie is valid.
 * Deliberately PII-free; an unauthenticated caller gets `401` instead.
 */
export const sessionResponseSchema = z.object({ authenticated: z.literal(true) });
export type SessionResponse = z.infer<typeof sessionResponseSchema>;

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

/* -------------------------------------------------------------------------- *
 * The user document's detailed shapes (D6, D9, D13, ticket 04).
 *
 * `userDocSchema` above stays the open, storage-level shape the `Repo` moves;
 * `userSchema` below is what the API validates it against on read and what the
 * Settings page renders. Every field is filled only from the author's sources
 * (`seed/source/*.md`); anything they do not state is `null` and resolves to
 * user-only (D9, D11). Compensation is never stored: it is always user-only,
 * and the salary floor comes from the API's environment, not this document.
 * -------------------------------------------------------------------------- */

/** A verbatim quote from the job-search prompt, so every rule traces to its wording (D6). */
const sourceQuoteSchema = z.string().min(1);

export const experienceEntrySchema = z.object({
  company: z.string(),
  title: z.string(),
  /** As written in the resume, e.g. "Feb 2023". */
  start: z.string(),
  /** `null` while the role is current. */
  end: z.string().nullable(),
  highlights: z.array(z.string()),
});
export type ExperienceEntry = z.infer<typeof experienceEntrySchema>;

/**
 * Who the user is (resume + contact details). Name, contact details and
 * address are filled into forms in code and never sent to the model (D23).
 */
export const userProfileSchema = z.object({
  fullName: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  phone: z.string(),
  location: z.string(),
  links: z.object({
    linkedin: z.string().nullable(),
    github: z.string().nullable(),
    website: z.string().nullable(),
  }),
  headline: z.string(),
  summary: z.string(),
  experience: z.array(experienceEntrySchema),
  skills: z.array(z.object({ category: z.string(), items: z.array(z.string()) })),
  leadership: z.array(z.string()),
  education: z.array(
    z.object({
      degree: z.string(),
      school: z.string(),
      startYear: z.number().int().nullable(),
      endYear: z.number().int().nullable(),
    }),
  ),
});
export type UserProfile = z.infer<typeof userProfileSchema>;

/**
 * One additive fit criterion (D6, D7). Criteria sharing a `group` are
 * exclusive: only the highest-weighted met one counts ("highest only", "else").
 * Negative weights are penalties.
 */
export const fitCriterionSchema = z.object({
  id: z.string(),
  label: z.string(),
  weight: z.number().int(),
  group: z.string().nullable(),
  /** Terms a keyword matcher can look for; the AI judges against `label` and `source`. */
  terms: z.array(z.string()),
  source: sourceQuoteSchema,
});
export type FitCriterion = z.infer<typeof fitCriterionSchema>;

/**
 * A disqualifying rule checked in code before any AI call (D7). `terms` and
 * `threshold` are its parameters; which ones a rule uses is fixed by its `id`.
 */
export const hardBlockRuleSchema = z.object({
  id: z.string(),
  label: z.string(),
  terms: z.array(z.string()),
  threshold: z.number().nullable(),
  source: sourceQuoteSchema,
});
export type HardBlockRule = z.infer<typeof hardBlockRuleSchema>;

/** A cap on the Verdict for IC titles in a given stack (the language gate). */
export const languageGateRuleSchema = z.object({
  id: z.string(),
  label: z.string(),
  terms: z.array(z.string()),
  cap: z.enum(["APPLY", "STRETCH"]),
  source: sourceQuoteSchema,
});
export type LanguageGateRule = z.infer<typeof languageGateRuleSchema>;

/** The rubric and hard-block inputs, from the author's job-search prompt (D6). */
export const userPreferencesSchema = z.object({
  region: z.string(),
  goal: z.object({ text: z.string(), source: sourceQuoteSchema }),
  location: z.object({
    accepted: z.array(z.string()),
    remoteOpenTo: z.array(z.string()),
    source: sourceQuoteSchema,
  }),
  stack: z.object({
    strong: z.array(z.string()),
    workingKnowledge: z.array(z.string()),
    not: z.array(z.string()),
  }),
  /** Titles that are skipped outright (not blocked). */
  excludedTitles: z.object({ terms: z.array(z.string()), source: sourceQuoteSchema }),
  companyBlocks: z.object({
    categories: z.array(
      z.object({
        id: z.string(),
        label: z.string(),
        companies: z.array(z.string()),
        source: sourceQuoteSchema,
      }),
    ),
    /** Large companies that are not blocked by size. */
    allowedExceptions: z.object({ companies: z.array(z.string()), source: sourceQuoteSchema }),
  }),
  hardBlocks: z.array(hardBlockRuleSchema),
  languageGate: z.array(languageGateRuleSchema),
  fitCriteria: z.array(fitCriterionSchema),
  fitCap: z.number().int().positive(),
  verdictBands: z.object({
    applyNowMinFit: z.number().int(),
    applyMinFit: z.number().int(),
    source: sourceQuoteSchema,
  }),
  /** Manager titles get EM framing, IC titles Staff framing in AI answers (D12). */
  tierFraming: z.object({
    manager: z.literal("EM"),
    ic: z.literal("Staff"),
    source: sourceQuoteSchema,
  }),
});
export type UserPreferences = z.infer<typeof userPreferencesSchema>;

/**
 * The author's answers to common application-form questions (D9). `null`
 * means the sources do not say, so the field resolves to user-only.
 */
export const applicationSettingsSchema = z.object({
  location: z.object({
    current: z.string().nullable(),
    postalAddress: z.string().nullable(),
    willingToRelocate: z.boolean().nullable(),
    relocationScope: z.string().nullable(),
    workArrangement: z.string().nullable(),
    workAuthorizationCountries: z.array(z.string()),
    requiresVisaSponsorship: z.boolean().nullable(),
    citizenship: z.string().nullable(),
  }),
  availability: z.object({
    noticePeriodDays: z.number().int().nonnegative().nullable(),
    /** ISO date (YYYY-MM-DD). */
    earliestStartDate: z.string().nullable(),
  }),
  education: z.object({
    highestDegree: z.string().nullable(),
    school: z.string().nullable(),
    graduationYear: z.number().int().nullable(),
  }),
  experience: z.object({
    totalYears: z.number().nonnegative().nullable(),
    peopleManagementYears: z.number().nonnegative().nullable(),
    largestTeamManaged: z.number().int().nonnegative().nullable(),
  }),
  documents: z.object({
    resumeUrl: z.string().nullable(),
    coverLetter: z.string().nullable(),
  }),
  other: z.object({
    howDidYouHear: z.string().nullable(),
    pronouns: z.string().nullable(),
  }),
  /** Question categories that are never auto-answered (D10) or seeded (compensation). */
  alwaysUserOnly: z.array(z.string()),
});
export type ApplicationSettings = z.infer<typeof applicationSettingsSchema>;

/**
 * The user document with its parts validated: what the API reads, the
 * pipeline consumes and `GET /api/me` returns. Every `User` is also a valid
 * {@link UserDoc}.
 */
export const userSchema = z.object({
  uid: z.string(),
  profile: userProfileSchema,
  preferences: userPreferencesSchema,
  settings: applicationSettingsSchema,
});
export type User = z.infer<typeof userSchema>;

/** `GET /api/me`: the signed-in user's document. */
export const meResponseSchema = userSchema;
export type MeResponse = z.infer<typeof meResponseSchema>;

/**
 * The hard block whose floor is the API's `SALARY_FLOOR_LPA`, never the user
 * document: compensation is always user-only and never stored (ticket 04), so
 * this rule's `threshold` stays `null`.
 */
export const SALARY_FLOOR_RULE_ID = "salary_below_floor";

/**
 * `PUT /api/me` (ticket 17): the edited profile, preferences and settings,
 * replacing the stored ones whole. The uid comes from the session, never the
 * body. `settings.alwaysUserOnly` is not editable (D10): the API keeps the
 * stored list. Unknown keys are dropped, so nothing outside the contract
 * (compensation included) is ever stored. Verdict bands must be ordered within
 * the fit cap.
 */
export const updateMeRequestSchema = z
  .object({
    profile: userProfileSchema,
    preferences: userPreferencesSchema,
    settings: applicationSettingsSchema.omit({ alwaysUserOnly: true }),
  })
  .superRefine(({ preferences: p }, ctx) => {
    const { applyMinFit, applyNowMinFit } = p.verdictBands;
    if (applyMinFit < 1 || applyMinFit > applyNowMinFit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["preferences", "verdictBands", "applyMinFit"],
        message: "APPLY must start between 1 and the APPLY NOW band",
      });
    }
    if (applyNowMinFit > p.fitCap) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["preferences", "verdictBands", "applyNowMinFit"],
        message: "APPLY NOW cannot start above the fit cap",
      });
    }
    p.hardBlocks.forEach((rule, index) => {
      if (rule.id === SALARY_FLOOR_RULE_ID && rule.threshold !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["preferences", "hardBlocks", index, "threshold"],
          message: "The salary floor is never stored; it comes from the server",
        });
      }
    });
  });
export type UpdateMeRequest = z.infer<typeof updateMeRequestSchema>;

/** `PUT /api/me` → `200`: the user document as stored after the edit. */
export const updateMeResponseSchema = meResponseSchema;
export type UpdateMeResponse = z.infer<typeof updateMeResponseSchema>;

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
  /**
   * How this Run judges the AI-side criteria, fixed when it starts (D24):
   * `ai` when an AI key is configured (a single Evaluation may still fall
   * back, see its `scoredBy`); `fallback` when none is, so the whole Run uses
   * the keyword matcher and the UI says so. Absent on Runs from before it.
   */
  scoring: z.lazy(() => scoredBySchema).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Run = z.infer<typeof runSchema>;

/**
 * The `reason` of a Run that a server restart killed mid-flight: on startup
 * the API fails every Run still active from before boot with it, and the UI
 * explains it instead of showing a Run stuck forever (spec, Persistence).
 */
export const RUN_INTERRUPTED_REASON = "interrupted";

/**
 * Fixed `reason`s of a `skipped` Evaluation (D15, D17, D8), so the API and the
 * UI agree on them: `seen` — evaluated in an earlier Run, skipped before any
 * spend; `limit` — the Run's AI-evaluation cap was reached before this Posting
 * got a slot; `stretch` — the Verdict was STRETCH or below. Blocked and other
 * skipped Evaluations carry a free-text reason naming the rule and evidence.
 */
export const SKIP_REASONS = {
  seen: "seen",
  limit: "limit",
  stretch: "stretch",
} as const;
export type SkipReason = (typeof SKIP_REASONS)[keyof typeof SKIP_REASONS];

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
 * Fixed `reason`s of a `held` Evaluation (D8, D11): `below_auto_threshold` —
 * the Verdict was APPLY, a match worth applying to but not unattended;
 * `needs_you` — a required form field only the user can answer.
 */
export const HELD_REASONS = {
  belowAutoThreshold: "below_auto_threshold",
  needsYou: "needs_you",
} as const;
export type HeldReason = (typeof HELD_REASONS)[keyof typeof HELD_REASONS];

/**
 * The fit scale and Verdict bands (D8), from the job-search prompt: "FIT 1-10
 * (cap 10)" and "APPLY NOW = fit 7+ with no gaps. APPLY = fit 5-6, or 7+ with
 * minor gaps." Below `APPLY_MIN_FIT` is STRETCH. These seed the user's
 * `preferences.fitCap` and `preferences.verdictBands`, which the scorer reads.
 */
export const FIT_CAP = 10;
export const APPLY_NOW_MIN_FIT = 7;
export const APPLY_MIN_FIT = 5;

/**
 * Which side of the reliability split judged a criterion (spec, Evaluation):
 * `code` for what code parses properly (the title tier), `ai` for judgement
 * over prose — answered by the AI or, as fallback, the keyword matcher.
 */
export const judgedBySchema = z.enum(["code", "ai"]);
export type JudgedBy = z.infer<typeof judgedBySchema>;

/** What judged the `ai` criteria of an Evaluation: the AI, or the keyword matcher (D24). */
export const scoredBySchema = z.enum(["ai", "fallback"]);
export type ScoredBy = z.infer<typeof scoredBySchema>;

/**
 * One rubric criterion as judged for one Posting (D7): met or not, the quote
 * that supports it, and the points it added. `points` is the weight when the
 * criterion counted, else 0 — a met criterion in a "highest only" group can be
 * outscored by a sibling. The score is the capped sum of `points`.
 */
export const criterionEvidenceSchema = z.object({
  criterionId: z.string(),
  label: z.string(),
  weight: z.number().int(),
  judgedBy: judgedBySchema,
  met: z.boolean(),
  evidence: z.string(),
  points: z.number().int(),
});
export type CriterionEvidence = z.infer<typeof criterionEvidenceSchema>;

/**
 * A required application-form field nobody but the user can answer (D11),
 * listed on a `held: needs_you` Evaluation. `id` is the ATS's own field name
 * (e.g. Greenhouse `question_18610029008`); `why` says why it was not filled,
 * e.g. "Legal agreement; never auto-answered (D10)".
 */
export const missingFieldSchema = z.object({
  id: z.string(),
  label: z.string(),
  why: z.string(),
});
export type MissingField = z.infer<typeof missingFieldSchema>;

/**
 * Fixed `reason`s of a `failed` Evaluation that the UI recognises: `simulated`
 * — the deliberate failure of a Run's first submit (D19), which Retry clears.
 * Other failures carry a free-text reason.
 */
export const FAILED_REASONS = {
  simulated: "simulated",
} as const;
export type FailedReason = (typeof FAILED_REASONS)[keyof typeof FAILED_REASONS];

/** A value in a built Greenhouse payload: text, an option's value, or a multi-select's values. */
export const payloadValueSchema = z.union([
  z.string(),
  z.number(),
  z.array(z.union([z.string(), z.number()])),
]);
export type PayloadValue = z.infer<typeof payloadValueSchema>;

/** The normalised type of an application-form field (spec, Greenhouse form merge). */
export const formFieldTypeSchema = z.enum([
  "text",
  "textarea",
  "select",
  "multiselect",
  "file",
  "boolean",
]);
export type FormFieldTypeName = z.infer<typeof formFieldTypeSchema>;

/** One choice of a select field; `value` is what the ATS expects back in the payload. */
export const formOptionSchema = z.object({
  label: z.string(),
  value: z.union([z.string(), z.number()]),
});

/**
 * One answered form field behind a submission (D9): the ATS's field id, its
 * label and type, which source answered it, and the answer — text, or the
 * chosen options of a select. "View payload" shows these, and Retry rebuilds
 * the payload from them (D19).
 */
export const submittedAnswerSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: formFieldTypeSchema,
  source: z.enum(["profile", "settings", "ai"]),
  value: z.union([z.string(), z.array(formOptionSchema)]),
});
export type SubmittedAnswer = z.infer<typeof submittedAnswerSchema>;

/**
 * A simulated application (D18): the real Greenhouse payload, keyed by the
 * form's own field ids, built and stored but never sent — `sent` is always
 * `false`. `endpoint` names where a real submit would go; nothing calls it.
 * `attempt` counts submits of this Evaluation (2 after a Retry, D19).
 */
export const simulatedSubmissionSchema = z.object({
  ats: atsSchema,
  endpoint: z.string().url(),
  method: z.literal("POST"),
  sent: z.literal(false),
  formUrl: z.string().url(),
  payload: z.record(z.string(), payloadValueSchema),
  answers: z.array(submittedAnswerSchema),
  attempt: z.number().int().positive(),
  builtAt: z.string(),
});
export type SimulatedSubmission = z.infer<typeof simulatedSubmissionSchema>;

/**
 * The per-run record of what we decided about one Posting (GLOSSARY:
 * Evaluation), stored as one document under its Run.
 */
export const evaluationSchema = z.object({
  jobKey: z.string(),
  runId: z.string(),
  posting: postingSchema,
  status: evaluationStatusSchema,
  verdict: verdictSchema.nullable(),
  score: z.number().nullable(),
  reason: z.string().nullable(),
  /** Per-criterion evidence behind `score`; empty until the Posting is scored. */
  evidence: z.array(criterionEvidenceSchema).default([]),
  /** Who judged the AI-side criteria; `null` until scored, or when never scored. */
  scoredBy: scoredBySchema.nullable().default(null),
  /** The required form fields the user must answer when `held: needs_you` (D11); else empty. */
  missingFields: z.array(missingFieldSchema).default([]),
  /** The built, never-sent payload once a submit was attempted (D18); else `null`. */
  submission: simulatedSubmissionSchema.nullable().default(null),
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

/** `GET /api/runs`: the user's Runs, newest first (Scanned jobs, ticket 12). */
export const runsListResponseSchema = z.object({ runs: z.array(runSchema) });
export type RunsListResponse = z.infer<typeof runsListResponseSchema>;

/**
 * `GET /api/evaluations[?runId=]`: stored Evaluations with their Verdict,
 * reason and per-criterion evidence (Scanned jobs, ticket 12). With `runId`,
 * that Run's in the order they were added; without, every Run's, newest Run
 * first.
 */
export const evaluationsListResponseSchema = z.object({ evaluations: z.array(evaluationSchema) });
export type EvaluationsListResponse = z.infer<typeof evaluationsListResponseSchema>;

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

/**
 * `POST /api/runs/:runId/jobs/:jobKey/retry` → `200`: Retry of a simulated
 * failure (D19) succeeded; the Evaluation is now `submitted`, with its payload.
 */
export const retrySubmitResponseSchema = z.object({ evaluation: evaluationSchema });
export type RetrySubmitResponse = z.infer<typeof retrySubmitResponseSchema>;

/** The latest Run document. */
export const runEventSchema = runSchema;
/** The latest version of one Evaluation; consumers keep the latest per Job Key. */
export const evalEventSchema = evaluationSchema;

/** Sent once, after the terminal `run` event, just before the stream ends. */
export const doneEventSchema = z.object({ runId: z.string(), status: runStatusSchema });
export type DoneEvent = z.infer<typeof doneEventSchema>;

/** A subscription failure surfaced on the stream, in the shared error shape. */
export const errorEventSchema = errorResponseSchema;

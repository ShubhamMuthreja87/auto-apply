/**
 * The one place that owns status transitions (D16; CODING_STANDARDS landmine:
 * status transitions). Each machine is a table of the moves it allows; every
 * Run and Evaluation status change in the API is checked here first and an
 * illegal move throws. Statuses only move forward, with one exception kept
 * out of the forward table on purpose: Retry on a simulated failure
 * (failed → applying, D19), checked by its own function.
 */
import { FAILED_REASONS, type EvaluationStatus, type RunStatus } from "@auto-apply/shared";

export class IllegalTransitionError extends Error {
  constructor(
    readonly machine: "run" | "evaluation",
    readonly from: string,
    readonly to: string,
  ) {
    super(`illegal ${machine} transition: ${from} → ${to}`);
    this.name = "IllegalTransitionError";
  }
}

/** Run: discovering → evaluating → applying → completed, or failed from any active stage. */
const runMoves: Record<RunStatus, readonly RunStatus[]> = {
  discovering: ["evaluating", "failed"],
  evaluating: ["applying", "failed"],
  applying: ["completed", "failed"],
  completed: [],
  failed: [],
};

/**
 * Evaluation: queued → evaluating → blocked | skipped | held | applying | failed;
 * applying → submitted (simulated) | failed. `queued → failed` is only taken by
 * startup recovery, for a job its interrupted Run never reached.
 */
const evaluationMoves: Record<EvaluationStatus, readonly EvaluationStatus[]> = {
  queued: ["evaluating", "failed"],
  evaluating: ["blocked", "skipped", "held", "applying", "failed"],
  blocked: [],
  skipped: [],
  held: [],
  applying: ["submitted", "failed"],
  submitted: [],
  failed: [],
};

export function assertRunTransition(from: RunStatus, to: RunStatus): void {
  if (!runMoves[from].includes(to)) throw new IllegalTransitionError("run", from, to);
}

export function assertEvaluationTransition(from: EvaluationStatus, to: EvaluationStatus): void {
  if (!evaluationMoves[from].includes(to)) throw new IllegalTransitionError("evaluation", from, to);
}

/**
 * The single backward edge (D19): Retry moves an Evaluation that failed on
 * purpose (`failed: simulated`) back to `applying`. Any other failure, or any
 * other status, is not retryable.
 */
export const RETRY_EDGE = {
  from: "failed",
  reason: FAILED_REASONS.simulated,
  to: "applying",
} as const satisfies { from: EvaluationStatus; reason: string; to: EvaluationStatus };

export function assertRetryTransition(from: {
  status: EvaluationStatus;
  reason: string | null;
}): void {
  if (from.status !== RETRY_EDGE.from || from.reason !== RETRY_EDGE.reason) {
    throw new IllegalTransitionError(
      "evaluation",
      `${from.status}${from.reason ? ` (${from.reason})` : ""}`,
      `${RETRY_EDGE.to} (retry)`,
    );
  }
}

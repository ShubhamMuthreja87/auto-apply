/**
 * The one place that owns status transitions (D16; CODING_STANDARDS landmine:
 * status transitions). Each machine is a table of the moves it allows; every
 * Run and Evaluation status change in the API is checked here first and an
 * illegal move throws. Statuses only move forward. The single backward edge,
 * Retry on a simulated failure (failed → applying, D19), is added explicitly
 * with ticket 11.
 */
import type { EvaluationStatus, RunStatus } from "@auto-apply/shared";

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
 * applying → submitted (simulated) | failed.
 */
const evaluationMoves: Record<EvaluationStatus, readonly EvaluationStatus[]> = {
  queued: ["evaluating"],
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

import { describe, expect, it } from "vitest";
import {
  evaluationStatusSchema,
  runStatusSchema,
  type EvaluationStatus,
  type RunStatus,
} from "@auto-apply/shared";
import {
  IllegalTransitionError,
  assertEvaluationTransition,
  assertRetryTransition,
  assertRunTransition,
} from "./transitions.js";

/** Every legal Run move (D16): forward one stage, or fail from any active stage. */
const legalRunMoves: ReadonlyArray<[RunStatus, RunStatus]> = [
  ["discovering", "evaluating"],
  ["discovering", "failed"],
  ["evaluating", "applying"],
  ["evaluating", "failed"],
  ["applying", "completed"],
  ["applying", "failed"],
];

/** Every legal forward Evaluation move (D16). Retry is its own, explicit edge (below). */
const legalEvaluationMoves: ReadonlyArray<[EvaluationStatus, EvaluationStatus]> = [
  ["queued", "evaluating"],
  ["evaluating", "blocked"],
  ["evaluating", "skipped"],
  ["evaluating", "held"],
  ["evaluating", "applying"],
  ["evaluating", "failed"],
  ["applying", "submitted"],
  ["applying", "failed"],
];

function allPairs<T extends string>(values: readonly T[]): Array<[T, T]> {
  return values.flatMap((from) => values.map((to): [T, T] => [from, to]));
}

function isListed<T>(moves: ReadonlyArray<[T, T]>, from: T, to: T): boolean {
  return moves.some(([f, t]) => f === from && t === to);
}

describe("Run transitions", () => {
  it.each(allPairs(runStatusSchema.options))("%s → %s", (from, to) => {
    if (isListed(legalRunMoves, from, to)) {
      expect(() => assertRunTransition(from, to)).not.toThrow();
    } else {
      expect(() => assertRunTransition(from, to)).toThrow(IllegalTransitionError);
    }
  });

  it("names the machine and both statuses when it rejects a move", () => {
    expect(() => assertRunTransition("completed", "evaluating")).toThrow(
      "illegal run transition: completed → evaluating",
    );
  });
});

describe("Evaluation transitions", () => {
  it.each(allPairs(evaluationStatusSchema.options))("%s → %s", (from, to) => {
    if (isListed(legalEvaluationMoves, from, to)) {
      expect(() => assertEvaluationTransition(from, to)).not.toThrow();
    } else {
      expect(() => assertEvaluationTransition(from, to)).toThrow(IllegalTransitionError);
    }
  });

  it("rejects moving a terminal outcome back to evaluating", () => {
    expect(() => assertEvaluationTransition("skipped", "evaluating")).toThrow(
      "illegal evaluation transition: skipped → evaluating",
    );
  });
});

describe("Retry: the one backward edge (D19)", () => {
  it("allows failed → applying only for a simulated failure", () => {
    expect(() => assertRetryTransition({ status: "failed", reason: "simulated" })).not.toThrow();
  });

  it("is not a forward move: the ordinary check still rejects failed → applying", () => {
    expect(() => assertEvaluationTransition("failed", "applying")).toThrow(IllegalTransitionError);
  });

  it.each([
    { status: "failed", reason: "Application form unavailable" },
    { status: "failed", reason: null },
    { status: "submitted", reason: null },
    { status: "held", reason: "simulated" },
    { status: "applying", reason: null },
  ] as const)("rejects retrying $status ($reason)", (from) => {
    expect(() => assertRetryTransition(from)).toThrow(IllegalTransitionError);
  });
});

/**
 * The pipeline: one deep module behind `buildPipeline(deps)`, the composition
 * root that receives every port plus the injected `clock`, `delay` and id
 * source, and news-up nothing itself (spec, Pipeline). Tests drive it with
 * fakes and an instant `delay`; production passes real timers.
 *
 * A Run: load the user → discover Postings → pull them through a pool of
 * `MAX_IN_FLIGHT` workers (D17). Each pulled Posting is persisted as `queued`,
 * moves to `evaluating`, and then, cheapest first:
 *   1. Seen in an earlier Run → `skipped: seen` (D15), before any spend.
 *   2. Screening in code (D7) → `blocked` by a hard block, or `skipped` for a
 *      title out of target, with a reason; no AI tokens spent.
 *   3. Otherwise it takes one of the Run's `MAX_AI_EVALS` evaluation slots and
 *      goes to the `JobEvaluator`; with no slot left it is `skipped: limit`.
 * Once every slot is taken the pool stops pulling, and Postings never pulled
 * are not persisted. Seen-skips and screening outcomes take no slot.
 *
 *   4. Scoring in code (D7, D8): the title tier is judged in code, the rest
 *      by the evaluator; `score.ts` sums the weights into a fit score and a
 *      Verdict, stored with every criterion's evidence. The Verdict drives
 *      the outcome: APPLY → `held: below_auto_threshold`; STRETCH →
 *      `skipped: stretch`; APPLY NOW → fill and submit, which tickets 10/11
 *      build — until then it is `held` with {@link AWAITING_SUBMIT_REASON}.
 *
 * Every status change goes through the transition table (`transitions.ts`).
 */
import {
  MAX_AI_EVALS,
  MAX_IN_FLIGHT,
  HELD_REASONS,
  SKIP_REASONS,
  emptyFunnel,
  jobKey,
  type EvaluationDelta,
  type EvaluationStatus,
  type Posting,
  type Repo,
  type Run,
  type RunFunnel,
  type RunStatus,
  type ScoredBy,
  type User,
} from "@auto-apply/shared";
import { aiCriteria, buildRubric, judgeInCode } from "../evaluation/rubric.js";
import { scoreJudgements } from "../evaluation/score.js";
import { screenPosting, type ScreeningOptions } from "../evaluation/screen.js";
import { logger } from "../logger.js";
import type { Discovery, JobEvaluator } from "./ports.js";
import { assertEvaluationTransition, assertRunTransition } from "./transitions.js";

export interface PipelineDeps {
  repo: Repo;
  discovery: Discovery;
  evaluator: JobEvaluator;
  /**
   * How Runs score, recorded on each Run so the UI can say so (D24):
   * `fallback` when no AI key is configured and `evaluator` is the keyword
   * matcher for the whole Run. Omitted, the Run does not record it.
   */
  scoringMode?: ScoredBy;
  /** Parameters for screening that do not live in the user document (the salary floor). */
  screening?: ScreeningOptions;
  clock: () => Date;
  /** Paces the stages so the live view is watchable; instant in tests. */
  delay: (ms: number) => Promise<void>;
  newRunId: () => string;
  /**
   * Loads and validates the Run's user document (profile, preferences,
   * settings). Bound to the `Repo` in the composition root, so the pipeline
   * never reads storage for it itself; it is read per Run, so Settings edits
   * apply to the next Run.
   */
  loadUser: (uid: string) => Promise<User>;
}

export interface StartedRun {
  runId: string;
  /**
   * Settles when the background work ends, never rejects (a failure becomes a
   * `failed` Run). The route ignores it; tests await it.
   */
  finished: Promise<void>;
}

export interface Pipeline {
  /**
   * Creates the Run and starts it in the background, resolving as soon as the
   * Run exists. Rejects with `ActiveRunExistsError` if the user already has an
   * active Run (D17).
   */
  startRun(uid: string): Promise<StartedRun>;
}

/** Pause per stage and per Posting, so a demo can watch the statuses move. */
const STEP_MS = 500;

/**
 * Interim outcome of an APPLY NOW Posting until form fill (ticket 10) and the
 * simulated submit (ticket 11) land: held, so nothing looks submitted.
 */
export const AWAITING_SUBMIT_REASON = "APPLY NOW; form fill and simulated submit are not built yet";

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function buildPipeline(deps: PipelineDeps): Pipeline {
  const {
    repo,
    discovery,
    evaluator,
    scoringMode,
    screening = {},
    clock,
    delay,
    newRunId,
    loadUser,
  } = deps;

  /** The Run's current status, kept beside the store so every move is checked. */
  function runMachine(runId: string) {
    let status: RunStatus = "discovering";
    return {
      get status() {
        return status;
      },
      async move(to: RunStatus, reason?: string): Promise<void> {
        assertRunTransition(status, to);
        await repo.patchRun(runId, reason === undefined ? { status: to } : { status: to, reason });
        status = to;
      },
    };
  }

  async function runStages(runId: string, uid: string, run: ReturnType<typeof runMachine>) {
    // A missing or invalid user document fails the Run before any discovery.
    const user = await loadUser(uid);
    logger.info("run_user_loaded", {
      runId,
      fitCriteria: user.preferences.fitCriteria.length,
      hardBlocks: user.preferences.hardBlocks.length,
    });
    await delay(STEP_MS);
    const postings = await discovery.discover();
    await repo.patchRun(runId, { funnelIncrements: { discovered: postings.length } });

    await run.move("evaluating");
    await evaluateAll(runId, user, postings);

    await run.move("applying");
    await delay(STEP_MS);
    await run.move("completed");
  }

  /**
   * The pool: `MAX_IN_FLIGHT` workers pull Postings in discovery order until
   * none are left or every AI-evaluation slot is taken. Slots are counted
   * synchronously, so the cap holds however the workers interleave.
   */
  async function evaluateAll(runId: string, user: User, postings: readonly Posting[]) {
    let next = 0;
    let slotsTaken = 0;
    const slots = {
      take(): boolean {
        if (slotsTaken >= MAX_AI_EVALS) return false;
        slotsTaken++;
        return true;
      },
    };
    const pull = (): Posting | undefined =>
      slotsTaken < MAX_AI_EVALS && next < postings.length ? postings[next++] : undefined;

    async function worker(): Promise<void> {
      for (let posting = pull(); posting; posting = pull()) {
        await evaluateOne(runId, user, posting, slots);
      }
    }
    await Promise.all(Array.from({ length: MAX_IN_FLIGHT }, worker));
    logger.info("run_evaluated", {
      runId,
      discovered: postings.length,
      pulled: next,
      aiEvaluations: slotsTaken,
    });
  }

  async function evaluateOne(
    runId: string,
    user: User,
    posting: Posting,
    slots: { take(): boolean },
  ): Promise<void> {
    const key = jobKey(posting);
    const current: { status: EvaluationStatus } = { status: "queued" };
    async function move(to: EvaluationStatus, delta: EvaluationDelta = {}) {
      assertEvaluationTransition(current.status, to);
      await repo.patchEvaluation(runId, key, { ...delta, status: to });
      current.status = to;
    }
    async function finish(
      to: EvaluationStatus,
      reason: string,
      counted: keyof RunFunnel,
      options: { markSeen: boolean; evaluated?: boolean },
      outcome: EvaluationDelta = {},
    ) {
      await move(to, { ...outcome, reason });
      if (options.markSeen) await repo.markSeen(key);
      await repo.patchRun(runId, {
        funnelIncrements: { [counted]: 1, ...(options.evaluated ? { evaluated: 1 } : {}) },
      });
    }

    await recordQueued(runId, posting);
    try {
      await move("evaluating");
      await delay(STEP_MS);

      if (await repo.isSeen(key)) {
        return await finish("skipped", SKIP_REASONS.seen, "skipped", { markSeen: false });
      }

      const screened = screenPosting(posting, user.preferences, screening);
      if (screened.outcome === "blocked") {
        return await finish(
          "blocked",
          screened.reason,
          "blocked",
          { markSeen: true },
          { verdict: "BLOCKED" },
        );
      }
      if (screened.outcome === "skipped") {
        return await finish("skipped", screened.reason, "skipped", { markSeen: true });
      }

      if (!slots.take()) {
        // Not marked Seen: it was never evaluated, so a later Run considers it.
        return await finish("skipped", SKIP_REASONS.limit, "skipped", { markSeen: false });
      }
      const rubric = buildRubric(user.preferences);
      const toJudge = aiCriteria(rubric);
      const { scoredBy, judgements } = await evaluator.evaluate(posting, toJudge);
      // Only answers to what was asked count; code owns the title tier.
      const asked = new Set(toJudge.map((c) => c.id));
      const scored = scoreJudgements(rubric, [
        ...judgeInCode(rubric, posting.title),
        ...judgements.filter((j) => asked.has(j.criterionId)),
      ]);
      logger.info("posting_scored", {
        runId,
        jobKey: key,
        scoredBy,
        score: scored.score,
        verdict: scored.verdict,
      });
      const outcome = {
        verdict: scored.verdict,
        score: scored.score,
        evidence: scored.evidence,
        scoredBy,
      };
      const scoredOptions = { markSeen: true, evaluated: true };
      if (scored.verdict === "APPLY_NOW") {
        await finish("held", AWAITING_SUBMIT_REASON, "held", scoredOptions, outcome);
      } else if (scored.verdict === "APPLY") {
        await finish("held", HELD_REASONS.belowAutoThreshold, "held", scoredOptions, outcome);
      } else {
        await finish("skipped", SKIP_REASONS.stretch, "skipped", scoredOptions, outcome);
      }
    } catch (err) {
      // One Posting's failure never fails the Run (CODING_STANDARDS: never
      // swallow errors — it becomes a `failed` Evaluation with its reason).
      if (current.status !== "evaluating") throw err;
      const reason = messageOf(err);
      logger.error("posting_failed", { runId, jobKey: key, reason });
      await finish("failed", reason, "failed", { markSeen: false });
    }
  }

  /** Writes the Posting's Evaluation in its first status, `queued`. */
  async function recordQueued(runId: string, posting: Posting): Promise<void> {
    const now = clock().toISOString();
    await repo.putEvaluation(runId, {
      jobKey: jobKey(posting),
      runId,
      posting,
      status: "queued",
      verdict: null,
      score: null,
      reason: null,
      evidence: [],
      scoredBy: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  /** A crash inside the Run fails the Run with its reason; it never escapes. */
  async function fail(runId: string, run: ReturnType<typeof runMachine>, err: unknown) {
    const reason = messageOf(err);
    logger.error("run_failed", { runId, reason, wasStatus: run.status });
    try {
      await run.move("failed", reason);
    } catch (moveErr) {
      logger.error("run_fail_not_recorded", { runId, error: messageOf(moveErr) });
    }
  }

  return {
    async startRun(uid) {
      const now = clock().toISOString();
      const created: Run = {
        runId: newRunId(),
        uid,
        status: "discovering",
        funnel: emptyFunnel(),
        reason: null,
        ...(scoringMode ? { scoring: scoringMode } : {}),
        createdAt: now,
        updatedAt: now,
      };
      await repo.createRun(created);
      const run = runMachine(created.runId);
      const finished = runStages(created.runId, uid, run).catch((err: unknown) =>
        fail(created.runId, run, err),
      );
      return { runId: created.runId, finished };
    },
  };
}

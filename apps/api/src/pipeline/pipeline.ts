/**
 * The pipeline: one deep module behind `buildPipeline(deps)`, the composition
 * root that receives every port plus the injected `clock`, `delay` and id
 * source, and news-up nothing itself (spec, Pipeline). Tests drive it with
 * fakes and an instant `delay`; production passes real timers.
 *
 * Ticket 05 is the skeleton: it walks the Run through `discovering →
 * evaluating → applying → completed` over whatever the `JobSource` returns,
 * marking every Posting `skipped` because there is no evaluator yet. Later
 * tickets replace the evaluating and applying stages with real work.
 */
import {
  emptyFunnel,
  jobKey,
  type Posting,
  type Repo,
  type Run,
  type User,
} from "@auto-apply/shared";
import { logger } from "../logger.js";
import type { JobSource } from "./ports.js";

export interface PipelineDeps {
  repo: Repo;
  jobSource: JobSource;
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

/** Pause between skeleton stages, so a demo can watch the statuses move. */
const STEP_MS = 500;

const SKELETON_REASON = "skeleton pipeline: no evaluator yet";

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function buildPipeline(deps: PipelineDeps): Pipeline {
  const { repo, jobSource, clock, delay, newRunId, loadUser } = deps;

  async function runStages(runId: string, uid: string): Promise<void> {
    // A missing or invalid user document fails the Run before any discovery.
    // Hard blocks and the rubric (tickets 07, 08) will read from it.
    const user = await loadUser(uid);
    logger.info("run_user_loaded", {
      runId,
      fitCriteria: user.preferences.fitCriteria.length,
      hardBlocks: user.preferences.hardBlocks.length,
    });
    await delay(STEP_MS);
    const postings = await jobSource.discover();
    for (const posting of postings) await recordQueued(runId, posting);
    await repo.patchRun(runId, { funnelIncrements: { discovered: postings.length } });

    await repo.patchRun(runId, { status: "evaluating" });
    for (const posting of postings) {
      const key = jobKey(posting);
      await repo.patchEvaluation(runId, key, { status: "evaluating" });
      await delay(STEP_MS);
      await repo.patchEvaluation(runId, key, { status: "skipped", reason: SKELETON_REASON });
      await repo.patchRun(runId, { funnelIncrements: { evaluated: 1, skipped: 1 } });
    }

    await repo.patchRun(runId, { status: "applying" });
    await delay(STEP_MS);
    await repo.patchRun(runId, { status: "completed" });
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
      createdAt: now,
      updatedAt: now,
    });
  }

  /** A crash inside the Run fails the Run with its reason; it never escapes. */
  async function fail(runId: string, err: unknown): Promise<void> {
    const reason = messageOf(err);
    logger.error("run_failed", { runId, reason });
    try {
      await repo.patchRun(runId, { status: "failed", reason });
    } catch (patchErr) {
      logger.error("run_fail_not_recorded", {
        runId,
        error: messageOf(patchErr),
      });
    }
  }

  return {
    async startRun(uid) {
      const now = clock().toISOString();
      const run: Run = {
        runId: newRunId(),
        uid,
        status: "discovering",
        funnel: emptyFunnel(),
        reason: null,
        createdAt: now,
        updatedAt: now,
      };
      await repo.createRun(run);
      const finished = runStages(run.runId, uid).catch((err: unknown) => fail(run.runId, err));
      return { runId: run.runId, finished };
    },
  };
}

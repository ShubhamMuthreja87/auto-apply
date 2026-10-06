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
 *      `skipped: stretch`; APPLY NOW → fill the form.
 *   5. Form fill (D5, D9–D12, `forms/fill-form.ts`): the Greenhouse form is
 *      read and merged and every field resolved. A required field left
 *      unanswered → `held: needs_you` with the fields listed (D11). A
 *      complete form moves the Posting to `applying`.
 *   6. Simulated submit (D18, D19), in the Run's `applying` stage, one
 *      Posting at a time in discovery order: the `ApplicationSubmitter`
 *      builds the real payload from the answered fields and the pipeline
 *      stores it, never sending it. The Run's first submit fails on purpose
 *      (`failed: simulated`); {@link Pipeline.retrySubmit} is the Retry that
 *      then succeeds (`submitted`).
 *
 * Every status change goes through the transition table (`transitions.ts`);
 * Retry is its one explicit backward edge.
 */
import {
  FAILED_REASONS,
  MAX_AI_EVALS,
  MAX_IN_FLIGHT,
  HELD_REASONS,
  SKIP_REASONS,
  emptyFunnel,
  jobKey,
  type CriterionEvidence,
  type Evaluation,
  type EvaluationDelta,
  type EvaluationStatus,
  type Posting,
  type Repo,
  type Run,
  type RunFunnel,
  type RunStatus,
  type ScoredBy,
  type SubmittedAnswer,
  type User,
} from "@auto-apply/shared";
import { aiCriteria, buildRubric, judgeInCode } from "../evaluation/rubric.js";
import { scoreJudgements } from "../evaluation/score.js";
import { screenPosting, type ScreeningOptions } from "../evaluation/screen.js";
import { fillForm } from "../forms/fill-form.js";
import type { FieldResolution } from "../forms/resolve.js";
import { logger } from "../logger.js";
import type {
  Application,
  ApplicationSubmitter,
  Discovery,
  FreeTextAnswerer,
  GreenhouseForms,
  JobEvaluator,
} from "./ports.js";
import {
  assertEvaluationTransition,
  assertRetryTransition,
  assertRunTransition,
} from "./transitions.js";

export interface PipelineDeps {
  repo: Repo;
  discovery: Discovery;
  evaluator: JobEvaluator;
  /** Reads an APPLY NOW Posting's Greenhouse application form (D5). */
  forms: GreenhouseForms;
  /**
   * Drafts required free-text answers (D9, D12); `null` or omitted when no AI
   * is configured, so free text falls to the user (D24).
   */
  answerer?: FreeTextAnswerer | null;
  /** Builds and stores the payload of a complete form; never sends it (D18). */
  submitter: ApplicationSubmitter;
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
  /**
   * Retry (D19): resubmits an Evaluation that failed on purpose, rebuilding
   * its payload from the stored answers, and resolves with it `submitted`.
   * Rejects with {@link EvaluationNotFoundError} for an unknown Run or job, and
   * with `IllegalTransitionError` for anything but `failed: simulated` —
   * including a second Retry already under way.
   */
  retrySubmit(runId: string, jobKey: string): Promise<Evaluation>;
}

export class EvaluationNotFoundError extends Error {
  constructor(
    readonly runId: string,
    readonly jobKey: string,
  ) {
    super(`no evaluation ${jobKey} in run ${runId}`);
    this.name = "EvaluationNotFoundError";
  }
}

/** Pause per stage and per Posting, so a demo can watch the statuses move. */
const STEP_MS = 500;

/** An APPLY NOW Posting with a complete form, waiting for the Run's `applying` stage. */
interface ReadyApplication {
  key: string;
  /** Its place in discovery order, so submits (and so D19's first one) are deterministic. */
  order: number;
  application: Application;
}

/** The answered fields of a filled form, as stored with its submission. */
function answersOf(resolutions: readonly FieldResolution[]): SubmittedAnswer[] {
  return resolutions.flatMap((r): SubmittedAnswer[] => {
    if (r.source === "user" || r.value === undefined || r.value.length === 0) return [];
    return [
      {
        id: r.field.id,
        label: r.field.label,
        type: r.field.type,
        source: r.source,
        value: r.value,
      },
    ];
  });
}

/** EM framing for manager titles, Staff for IC titles (D12), from the code-judged title tier. */
function framingFor(user: User, evidence: readonly CriterionEvidence[]): "EM" | "Staff" {
  const manager = evidence.some((e) => e.criterionId === "title_manager" && e.points > 0);
  return manager ? user.preferences.tierFraming.manager : user.preferences.tierFraming.ic;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function buildPipeline(deps: PipelineDeps): Pipeline {
  const {
    repo,
    discovery,
    evaluator,
    forms,
    answerer = null,
    submitter,
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
    const ready = await evaluateAll(runId, user, postings);

    await run.move("applying");
    await delay(STEP_MS);
    await submitAll(runId, ready);
    await run.move("completed");
  }

  /**
   * The `applying` stage: every complete form is submitted (simulated), one
   * at a time in discovery order. The Run's first submit fails on purpose
   * (D19) so the demo shows failure and Retry.
   */
  async function submitAll(runId: string, ready: ReadyApplication[]): Promise<void> {
    const inOrder = [...ready].sort((a, b) => a.order - b.order);
    for (const [index, { key, application }] of inOrder.entries()) {
      await submitOne(runId, key, application, { simulateFailure: index === 0 });
    }
  }

  /**
   * One simulated submit of an Evaluation already `applying`: store the
   * built payload and record the outcome. A submitter error fails only this
   * Evaluation, with its reason.
   */
  async function submitOne(
    runId: string,
    key: string,
    application: Application,
    options: { simulateFailure: boolean },
  ): Promise<void> {
    let to: EvaluationStatus;
    let delta: EvaluationDelta;
    try {
      const { outcome, submission } = await submitter.submit(application, options);
      to = outcome;
      delta = { submission, reason: outcome === "failed" ? FAILED_REASONS.simulated : null };
    } catch (err) {
      to = "failed";
      delta = { reason: messageOf(err) };
      logger.error("submit_failed", { runId, jobKey: key, reason: delta.reason });
    }
    assertEvaluationTransition("applying", to);
    await repo.patchEvaluation(runId, key, { ...delta, status: to });
    await repo.patchRun(runId, {
      funnelIncrements: { [to === "submitted" ? "submitted" : "failed"]: 1 },
    });
    logger.info("application_submitted_simulated", {
      runId,
      jobKey: key,
      outcome: to,
      attempt: application.attempt,
    });
  }

  /** Retries in progress, so a double click cannot resubmit twice. */
  const retrying = new Set<string>();

  async function retrySubmit(runId: string, key: string): Promise<Evaluation> {
    const lock = `${runId}/${key}`;
    const evaluation = (await repo.listEvaluations(runId)).find((e) => e.jobKey === key);
    if (!evaluation) throw new EvaluationNotFoundError(runId, key);
    // A Retry already under way has the Evaluation in `applying`: not retryable.
    assertRetryTransition(retrying.has(lock) ? { status: "applying", reason: null } : evaluation);
    const stored = evaluation.submission;
    if (!stored) throw new Error(`No stored submission to retry for ${key}`);
    retrying.add(lock);
    try {
      await repo.patchEvaluation(runId, key, { status: "applying", reason: null });
      await repo.patchRun(runId, { funnelIncrements: { failed: -1 } });
      await submitOne(
        runId,
        key,
        {
          posting: evaluation.posting,
          formUrl: stored.formUrl,
          answers: stored.answers,
          attempt: stored.attempt + 1,
        },
        { simulateFailure: false },
      );
    } finally {
      retrying.delete(lock);
    }
    const after = (await repo.listEvaluations(runId)).find((e) => e.jobKey === key);
    if (!after) throw new EvaluationNotFoundError(runId, key);
    return after;
  }

  /**
   * The pool: `MAX_IN_FLIGHT` workers pull Postings in discovery order until
   * none are left or every AI-evaluation slot is taken. Slots are counted
   * synchronously, so the cap holds however the workers interleave.
   */
  async function evaluateAll(
    runId: string,
    user: User,
    postings: readonly Posting[],
  ): Promise<ReadyApplication[]> {
    const ready: ReadyApplication[] = [];
    let next = 0;
    let slotsTaken = 0;
    const slots = {
      take(): boolean {
        if (slotsTaken >= MAX_AI_EVALS) return false;
        slotsTaken++;
        return true;
      },
    };
    const pull = (): { posting: Posting; order: number } | undefined => {
      if (slotsTaken >= MAX_AI_EVALS || next >= postings.length) return undefined;
      const order = next++;
      const posting = postings[order];
      return posting ? { posting, order } : undefined;
    };

    async function worker(): Promise<void> {
      for (let item = pull(); item; item = pull()) {
        const { posting, order } = item;
        const application = await evaluateOne(runId, user, posting, slots);
        if (application) ready.push({ key: jobKey(posting), order, application });
      }
    }
    await Promise.all(Array.from({ length: MAX_IN_FLIGHT }, worker));
    logger.info("run_evaluated", {
      runId,
      discovered: postings.length,
      pulled: next,
      aiEvaluations: slotsTaken,
      readyToSubmit: ready.length,
    });
    return ready;
  }

  /**
   * Takes one Posting to its outcome, or to `applying` with a complete form:
   * then it returns the application for the Run's `applying` stage.
   */
  async function evaluateOne(
    runId: string,
    user: User,
    posting: Posting,
    slots: { take(): boolean },
  ): Promise<Application | null> {
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
    ): Promise<null> {
      await move(to, { ...outcome, reason });
      if (options.markSeen) await repo.markSeen(key);
      await repo.patchRun(runId, {
        funnelIncrements: { [counted]: 1, ...(options.evaluated ? { evaluated: 1 } : {}) },
      });
      return null;
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
        // The Verdict streams while the form is read; a form that cannot be
        // read fails the Posting below, keeping its Verdict.
        await repo.patchEvaluation(runId, key, outcome);
        const fill = await fillForm(
          { forms, answerer },
          posting,
          user,
          framingFor(user, scored.evidence),
        );
        logger.info("form_resolved", {
          runId,
          jobKey: key,
          formSource: fill.source,
          fields: fill.resolutions.length,
          missing: fill.missing.length,
        });
        if (fill.missing.length > 0) {
          return await finish("held", HELD_REASONS.needsYou, "held", scoredOptions, {
            missingFields: fill.missing,
          });
        }
        // Complete: it waits as `applying` for the Run's submit stage, which
        // counts it submitted or failed.
        await move("applying", { reason: null });
        await repo.markSeen(key);
        await repo.patchRun(runId, { funnelIncrements: { evaluated: 1 } });
        return { posting, formUrl: fill.formUrl, answers: answersOf(fill.resolutions), attempt: 1 };
      }
      if (scored.verdict === "APPLY") {
        return await finish(
          "held",
          HELD_REASONS.belowAutoThreshold,
          "held",
          scoredOptions,
          outcome,
        );
      }
      return await finish("skipped", SKIP_REASONS.stretch, "skipped", scoredOptions, outcome);
    } catch (err) {
      // One Posting's failure never fails the Run (CODING_STANDARDS: never
      // swallow errors — it becomes a `failed` Evaluation with its reason).
      if (current.status !== "evaluating") throw err;
      const reason = messageOf(err);
      logger.error("posting_failed", { runId, jobKey: key, reason });
      return await finish("failed", reason, "failed", { markSeen: false });
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
      missingFields: [],
      submission: null,
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
    retrySubmit,
  };
}

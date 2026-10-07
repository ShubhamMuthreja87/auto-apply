/**
 * The pipeline: one deep module behind `buildPipeline(deps)`, the composition
 * root that receives every port plus the injected `clock`, `delay` and id
 * source, and news-up nothing itself (spec, Pipeline). Tests drive it with
 * fakes and an instant `delay`; production passes real timers.
 *
 * A Run: load the user, with the preferences of its active preset
 * (`evaluation/preferences-preset.ts`) → discover Postings → per board, walk them newest
 * first and take up to `MAX_POSTINGS_PER_BOARD` not yet Seen (D15), so each
 * Run moves on to the next unseen Postings. Seen ones passed over get no
 * Evaluation; they are only counted, in `funnel.alreadySeen` → pull the
 * taken Postings through a pool of `LIMITS.maxInFlight` workers (D17). Each
 * pulled Posting is persisted as `queued`, moves to `evaluating`, and then,
 * cheapest first:
 *   1. Screening in code (D7) → `blocked` by a hard block, or `skipped` for a
 *      title out of target, with a reason; no AI tokens spent.
 *   2. Otherwise it takes one of the Run's `LIMITS.maxAiEvals` evaluation slots and
 *      goes to the `JobEvaluator`; with no slot left it is `skipped: limit`.
 * Once every slot is taken the pool stops pulling, and Postings never pulled
 * are not persisted. Screening outcomes take no slot.
 *
 *   3. Scoring in code (D7, D8): the title tier is judged in code, the rest
 *      by the evaluator; `score.ts` sums the weights into a fit score and a
 *      Verdict, then the language gate caps the Verdict of IC titles
 *      (`language-gate.ts`), stored with every criterion's evidence. The Verdict drives
 *      the outcome: APPLY → `held: below_auto_threshold`; STRETCH →
 *      `skipped: stretch`; APPLY NOW → fill the form. Under the demo preset
 *      APPLY and STRETCH are filled too (`appliesTo`), keeping their Verdict.
 *   4. Form fill (D5, D9–D12, `forms/fill-form.ts`): the Greenhouse form is
 *      read and merged and every field resolved. A required field left
 *      unanswered → `held: needs_you` with the fields listed (D11). A
 *      complete form moves the Posting to `applying`.
 *   5. Simulated submit (D18, D19), in the Run's `applying` stage, one
 *      Posting at a time in discovery order: the `ApplicationSubmitter`
 *      builds the real payload from the answered fields and the pipeline
 *      stores it, never sending it. The Run's first submit fails on purpose
 *      (`failed: simulated`); {@link Pipeline.retrySubmit} is the Retry that
 *      then succeeds (`submitted`).
 *
 * A `held: needs_you` Posting keeps its answered fields as a draft;
 * {@link Pipeline.submitAnswers} (Answer & submit) merges the user's answers
 * into it and submits it (simulated).
 *
 * Every status change goes through the transition table (`transitions.ts`);
 * Retry and Answer & submit are its two explicit, named edges.
 */
import {
  FAILED_REASONS,
  LIMITS,
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
  type UserAnswerValue,
} from "@auto-apply/shared";
import { checkUserAnswers } from "../forms/user-answers.js";
import { aiCriteria, buildRubric, judgeInCode } from "../evaluation/rubric.js";
import { applyLanguageGate, languageGateQuestions } from "../evaluation/language-gate.js";
import { scoreJudgements } from "../evaluation/score.js";
import { screenPosting, type ScreeningOptions } from "../evaluation/screen.js";
import { appliesTo, withPreferencesPreset } from "../evaluation/preferences-preset.js";
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
  assertAnswerTransition,
  assertEvaluationTransition,
  assertRetryTransition,
  assertRunTransition,
  IllegalTransitionError,
} from "./transitions.js";
import { messageOf } from "../errors.js";

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
  /** Unseen Postings taken per board per Run; {@link MAX_POSTINGS_PER_BOARD} unless a test widens it. */
  maxPostingsPerBoard?: number;
}

/**
 * Unseen Postings taken per board per Run, newest-updated first. A big board
 * lists hundreds of jobs. The Run's AI-evaluation cap (D17) stops pulling once
 * its slots are taken, but Seen and hard-blocked Postings take no slot, and
 * for this user most Postings are blocked by location; without this bound a
 * Run over 15 boards could write thousands of blocked Evaluations. Seen
 * Postings are passed over before the cap applies, so the next Run takes the
 * next unseen ones instead of the same newest few.
 */
export const MAX_POSTINGS_PER_BOARD = 10;

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
  /**
   * Answer & submit: merges the user's answers to a `held: needs_you` job's
   * missing fields into its stored draft and submits it (simulated), resolving
   * with it `submitted`. Rejects with {@link EvaluationNotFoundError} for an
   * unknown Run or job, `IllegalTransitionError` for any other job (or one
   * already being submitted), and {@link InvalidAnswersError} when a missing
   * field is unanswered or answered with something it cannot take.
   */
  submitAnswers(
    runId: string,
    jobKey: string,
    answers: Readonly<Record<string, UserAnswerValue>>,
  ): Promise<Evaluation>;
}

/** Names the fields whose answers were missing or invalid; never their values (PII). */
export class InvalidAnswersError extends Error {
  constructor(readonly fieldIds: readonly string[]) {
    super(`missing or invalid answers: ${fieldIds.join(", ")}`);
    this.name = "InvalidAnswersError";
  }
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
    maxPostingsPerBoard = MAX_POSTINGS_PER_BOARD,
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

  async function runStages(
    runId: string,
    loadingUser: Promise<User>,
    run: ReturnType<typeof runMachine>,
  ) {
    // A missing or invalid user document fails the Run before any discovery.
    const user = await loadingUser;
    logger.info("run_user_loaded", {
      runId,
      preferencesPreset: user.settings.preferencesPreset,
      fitCriteria: user.preferences.fitCriteria.length,
      hardBlocks: user.preferences.hardBlocks.length,
    });
    await delay(STEP_MS);
    const { postings, alreadySeen } = await selectPostings(await discovery.discover());
    await repo.patchRun(runId, { funnelIncrements: { discovered: postings.length, alreadySeen } });

    await run.move("evaluating");
    const ready = await evaluateAll(runId, user, postings);

    await run.move("applying");
    await delay(STEP_MS);
    await submitAll(runId, ready);
    await run.move("completed");
  }

  /**
   * Per board (discovery lists each board's Postings together, newest first):
   * walks its Postings, checking Seen only as it goes, until it has
   * `maxPostingsPerBoard` unseen ones or the board runs out. Returns the
   * unseen Postings taken, board by board, and how many Seen ones it passed over.
   */
  async function selectPostings(
    discovered: readonly Posting[],
  ): Promise<{ postings: Posting[]; alreadySeen: number }> {
    const boards = new Map<string, Posting[]>();
    for (const posting of discovered) {
      const board = `${posting.ats}:${posting.board}`;
      boards.set(board, [...(boards.get(board) ?? []), posting]);
    }
    let alreadySeen = 0;
    const takenPerBoard = await Promise.all(
      [...boards.values()].map(async (board) => {
        const taken: Posting[] = [];
        let walked = 0;
        while (taken.length < maxPostingsPerBoard && walked < board.length) {
          // Read only as many Seen keys as could still fill the cap.
          const chunk = board.slice(walked, walked + maxPostingsPerBoard - taken.length);
          walked += chunk.length;
          const flags = await Promise.all(chunk.map((p) => repo.isSeen(jobKey(p))));
          chunk.forEach((posting, i) => {
            if (flags[i]) alreadySeen++;
            else taken.push(posting);
          });
        }
        return taken;
      }),
    );
    return { postings: takenPerBoard.flat(), alreadySeen };
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
    // A second Retry while one is under way (a double click) is not retryable.
    if (retrying.has(lock)) {
      throw new IllegalTransitionError("evaluation", "applying (retry under way)", "applying");
    }
    assertRetryTransition(evaluation);
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

  /** Answer & submits in progress, so a double click cannot submit twice. */
  const answering = new Set<string>();

  async function submitAnswers(
    runId: string,
    key: string,
    given: Readonly<Record<string, UserAnswerValue>>,
  ): Promise<Evaluation> {
    const lock = `${runId}/${key}`;
    const evaluation = (await repo.listEvaluations(runId)).find((e) => e.jobKey === key);
    if (!evaluation) throw new EvaluationNotFoundError(runId, key);
    if (answering.has(lock)) {
      throw new IllegalTransitionError("evaluation", "applying (answer under way)", "applying");
    }
    assertAnswerTransition(evaluation);
    // A job held before drafts were kept cannot be finished without reading
    // its form again, so it is not answerable.
    const draft = evaluation.draft;
    if (!draft) {
      throw new IllegalTransitionError("evaluation", "held (needs_you, no draft)", "applying");
    }
    const checked = checkUserAnswers(evaluation.missingFields, given);
    if (!checked.ok) throw new InvalidAnswersError(checked.invalid);
    answering.add(lock);
    try {
      await repo.patchEvaluation(runId, key, {
        status: "applying",
        reason: null,
        missingFields: [],
      });
      await repo.patchRun(runId, { funnelIncrements: { held: -1 } });
      // No deliberate failure here: D19's "first submit fails" belongs to the
      // Run's applying stage only, and the user's own submit is not a Run's.
      await submitOne(
        runId,
        key,
        {
          posting: evaluation.posting,
          formUrl: draft.formUrl,
          answers: [...draft.answers, ...checked.answers],
          attempt: 1,
        },
        { simulateFailure: false },
      );
    } finally {
      answering.delete(lock);
    }
    const after = (await repo.listEvaluations(runId)).find((e) => e.jobKey === key);
    if (!after) throw new EvaluationNotFoundError(runId, key);
    return after;
  }

  /**
   * The pool: `LIMITS.maxInFlight` workers pull Postings in discovery order until
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
        if (slotsTaken >= LIMITS.maxAiEvals) return false;
        slotsTaken++;
        return true;
      },
    };
    const pull = (): { posting: Posting; order: number } | undefined => {
      if (slotsTaken >= LIMITS.maxAiEvals || next >= postings.length) return undefined;
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
    await Promise.all(Array.from({ length: LIMITS.maxInFlight }, worker));
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
      // The rubric's AI-side criteria, plus the language gate's zero-weight
      // questions about the primary stack (one call per Posting either way).
      const toJudge = [...aiCriteria(rubric), ...languageGateQuestions(user.preferences)];
      const { scoredBy, judgements } = await evaluator.evaluate(posting, toJudge);
      // Only answers to what was asked count; code owns the title tier.
      const asked = new Set(toJudge.map((c) => c.id));
      const answered = judgements.filter((j) => asked.has(j.criterionId));
      // The fit score first, then the language gate caps its Verdict.
      const scored = applyLanguageGate(
        user.preferences,
        posting,
        scoreJudgements(rubric, [...judgeInCode(rubric, posting.title), ...answered]),
        answered,
      );
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
      if (appliesTo(user, scored.verdict)) {
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
          // The answered fields stay as a draft, so Answer & submit can finish
          // the job without reading the form or calling the AI again.
          return await finish("held", HELD_REASONS.needsYou, "held", scoredOptions, {
            missingFields: fill.missing,
            draft: { formUrl: fill.formUrl, answers: answersOf(fill.resolutions) },
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
      draft: null,
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
      // Loaded before the Run exists, so the Run records its preferences
      // preset from the start; a load failure still creates the Run, which
      // then fails with the reason. The preset decides the preferences the
      // Run screens and scores with.
      const loadingUser = loadUser(uid).then(withPreferencesPreset);
      const loaded = await loadingUser.catch(() => null);
      const now = clock().toISOString();
      const created: Run = {
        runId: newRunId(),
        uid,
        status: "discovering",
        funnel: emptyFunnel(),
        reason: null,
        ...(scoringMode ? { scoring: scoringMode } : {}),
        ...(loaded ? { preferencesPreset: loaded.settings.preferencesPreset } : {}),
        createdAt: now,
        updatedAt: now,
      };
      await repo.createRun(created);
      const run = runMachine(created.runId);
      const finished = runStages(created.runId, loadingUser, run).catch((err: unknown) =>
        fail(created.runId, run, err),
      );
      return { runId: created.runId, finished };
    },
    retrySubmit,
    submitAnswers,
  };
}

/**
 * The in-memory twin of the Firestore repository. It mirrors the ADR-0001
 * logical layout (runs, per-run evaluations keyed by Job Key, seen keys beside
 * runs, users) and reproduces Firestore's `onSnapshot` semantics so most tests
 * — and local demos without credentials — run against it instead of the real
 * project. The shared contract suite (`repo-contract.ts`) pins both to the same
 * behaviour.
 */
import {
  ActiveRunExistsError,
  evaluationSchema,
  isRunActive,
  runSchema,
  type EvaluationChange,
  type Evaluation,
  type EvaluationDelta,
  type Repo,
  type Run,
  type RunDelta,
  type RunFunnel,
  type SubscriptionErrorHandler,
  type Unsubscribe,
  type UserDoc,
} from "@auto-apply/shared";
import type { z } from "zod";

/**
 * A live subscriber. `ready` flips true once its initial snapshot has been
 * delivered on a microtask; until then, writes are ignored as deltas because
 * the initial snapshot already reflects the latest state (Firestore coalesces
 * the same way). After it, every write is delivered in order.
 */
interface Listener<T> {
  readonly cb: (value: T) => void;
  readonly onError: SubscriptionErrorHandler;
  ready: boolean;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

/**
 * Validates a stored document on its way to a subscriber, as the Firestore
 * adapter does on read: one that breaks the contract becomes an `Error` for
 * `onError` instead of a callback, and the subscription keeps going (ADR-0003).
 */
function validate<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, value: unknown, label: string): T | Error {
  const parsed = schema.safeParse(structuredClone(value));
  return parsed.success ? parsed.data : new Error(`invalid ${label}: ${parsed.error.message}`);
}

export class InMemoryRepo implements Repo {
  private readonly users = new Map<string, UserDoc>();
  private readonly runs = new Map<string, Run>();
  // runId → (Job Key → Evaluation); the inner Map preserves insertion order so
  // the initial snapshot replays evaluations as they were added.
  private readonly evaluations = new Map<string, Map<string, Evaluation>>();
  private readonly seen = new Set<string>();
  private readonly runListeners = new Map<string, Set<Listener<Run>>>();
  private readonly evalListeners = new Map<string, Set<Listener<EvaluationChange[]>>>();

  async getUser(uid: string): Promise<UserDoc | null> {
    const user = this.users.get(uid);
    return user ? clone(user) : null;
  }

  async seedUserIfMissing(uid: string, doc: UserDoc): Promise<void> {
    if (!this.users.has(uid)) this.users.set(uid, clone(doc));
  }

  async createRun(run: Run): Promise<void> {
    const active = this.findActiveRun(run.uid);
    if (active) throw new ActiveRunExistsError(run.uid, active.runId);
    this.runs.set(run.runId, clone(run));
    this.notifyRun(run.runId);
  }

  async getRun(runId: string): Promise<Run | null> {
    const run = this.runs.get(runId);
    return run ? clone(run) : null;
  }

  async getActiveRun(uid: string): Promise<Run | null> {
    const active = this.findActiveRun(uid);
    return active ? clone(active) : null;
  }

  async patchRun(runId: string, delta: RunDelta): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`run ${runId} not found`);
    if (delta.status !== undefined) run.status = delta.status;
    if (delta.reason !== undefined) run.reason = delta.reason;
    if (delta.funnelIncrements) {
      for (const [key, by] of Object.entries(delta.funnelIncrements)) {
        if (by !== undefined) run.funnel[key as keyof RunFunnel] += by;
      }
    }
    run.updatedAt = new Date().toISOString();
    this.notifyRun(runId);
  }

  async putEvaluation(runId: string, evaluation: Evaluation): Promise<void> {
    const byKey = this.evaluations.get(runId) ?? new Map<string, Evaluation>();
    const type = byKey.has(evaluation.jobKey) ? "modified" : "added";
    byKey.set(evaluation.jobKey, clone(evaluation));
    this.evaluations.set(runId, byKey);
    this.notifyEvaluation(runId, { type, evaluation });
  }

  async patchEvaluation(runId: string, jobKey: string, delta: EvaluationDelta): Promise<void> {
    const evaluation = this.evaluations.get(runId)?.get(jobKey);
    if (!evaluation) throw new Error(`evaluation ${jobKey} not found in run ${runId}`);
    if (delta.status !== undefined) evaluation.status = delta.status;
    if (delta.verdict !== undefined) evaluation.verdict = delta.verdict;
    if (delta.score !== undefined) evaluation.score = delta.score;
    if (delta.reason !== undefined) evaluation.reason = delta.reason;
    if (delta.evidence !== undefined) evaluation.evidence = clone(delta.evidence);
    if (delta.scoredBy !== undefined) evaluation.scoredBy = delta.scoredBy;
    evaluation.updatedAt = new Date().toISOString();
    this.notifyEvaluation(runId, { type: "modified", evaluation });
  }

  async isSeen(jobKey: string): Promise<boolean> {
    return this.seen.has(jobKey);
  }

  async markSeen(jobKey: string): Promise<void> {
    this.seen.add(jobKey);
  }

  watchRun(runId: string, cb: (run: Run) => void, onError: SubscriptionErrorHandler): Unsubscribe {
    const listener: Listener<Run> = { cb, onError, ready: false };
    const set = this.runListeners.get(runId) ?? new Set<Listener<Run>>();
    set.add(listener);
    this.runListeners.set(runId, set);
    queueMicrotask(() => {
      const run = this.runs.get(runId);
      if (run) deliverRun(listener, run);
      listener.ready = true;
    });
    return () => set.delete(listener);
  }

  watchEvaluations(
    runId: string,
    cb: (changes: EvaluationChange[]) => void,
    onError: SubscriptionErrorHandler,
  ): Unsubscribe {
    const listener: Listener<EvaluationChange[]> = { cb, onError, ready: false };
    const set = this.evalListeners.get(runId) ?? new Set<Listener<EvaluationChange[]>>();
    set.add(listener);
    this.evalListeners.set(runId, set);
    queueMicrotask(() => {
      const byKey = this.evaluations.get(runId) ?? new Map<string, Evaluation>();
      const initial = [...byKey.values()].map((evaluation) => ({
        type: "added" as const,
        evaluation,
      }));
      deliverEvaluations(listener, initial);
      listener.ready = true;
    });
    return () => set.delete(listener);
  }

  private findActiveRun(uid: string): Run | undefined {
    for (const run of this.runs.values()) {
      if (run.uid === uid && isRunActive(run.status)) return run;
    }
    return undefined;
  }

  private notifyRun(runId: string): void {
    const run = this.runs.get(runId);
    const set = this.runListeners.get(runId);
    if (!run || !set) return;
    for (const listener of set) {
      if (listener.ready) deliverRun(listener, run);
    }
  }

  private notifyEvaluation(runId: string, change: EvaluationChange): void {
    const set = this.evalListeners.get(runId);
    if (!set) return;
    for (const listener of set) {
      if (listener.ready) deliverEvaluations(listener, [change]);
    }
  }
}

function deliverRun(listener: Listener<Run>, run: Run): void {
  const valid = validate(runSchema, run, `run ${run.runId}`);
  if (valid instanceof Error) listener.onError(valid);
  else listener.cb(valid);
}

/**
 * Delivers one batch, as a Firestore query snapshot does: invalid documents go
 * to `onError` one by one and are left out; the batch itself always arrives,
 * even empty, so the initial snapshot is never silent.
 */
function deliverEvaluations(
  listener: Listener<EvaluationChange[]>,
  changes: readonly EvaluationChange[],
): void {
  const valid: EvaluationChange[] = [];
  for (const { type, evaluation } of changes) {
    const parsed = validate(evaluationSchema, evaluation, `evaluation ${evaluation.jobKey}`);
    if (parsed instanceof Error) listener.onError(parsed);
    else valid.push({ type, evaluation: parsed });
  }
  listener.cb(valid);
}

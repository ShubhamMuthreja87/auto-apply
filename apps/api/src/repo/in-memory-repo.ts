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
  isRunActive,
  type EvaluationChange,
  type Evaluation,
  type EvaluationDelta,
  type Repo,
  type Run,
  type RunDelta,
  type RunFunnel,
  type Unsubscribe,
  type UserDoc,
} from "@auto-apply/shared";

/**
 * A live subscriber. `ready` flips true once its initial snapshot has been
 * delivered on a microtask; until then, writes are ignored as deltas because
 * the initial snapshot already reflects the latest state (Firestore coalesces
 * the same way). After it, every write is delivered in order.
 */
interface Listener<T> {
  readonly cb: (value: T) => void;
  ready: boolean;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class InMemoryRepo implements Repo {
  private readonly users = new Map<string, UserDoc>();
  private readonly runs = new Map<string, Run>();
  // runId → (Job Key → Evaluation); the inner Map preserves insertion order so
  // the initial snapshot replays evaluations as they were added.
  private readonly evaluations = new Map<string, Map<string, Evaluation>>();
  private readonly seen = new Set<string>();
  private readonly runListeners = new Map<string, Set<Listener<Run>>>();
  private readonly evalListeners = new Map<string, Set<Listener<EvaluationChange>>>();

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
    evaluation.updatedAt = new Date().toISOString();
    this.notifyEvaluation(runId, { type: "modified", evaluation });
  }

  async isSeen(jobKey: string): Promise<boolean> {
    return this.seen.has(jobKey);
  }

  async markSeen(jobKey: string): Promise<void> {
    this.seen.add(jobKey);
  }

  watchRun(runId: string, cb: (run: Run) => void): Unsubscribe {
    const listener: Listener<Run> = { cb, ready: false };
    const set = this.runListeners.get(runId) ?? new Set<Listener<Run>>();
    set.add(listener);
    this.runListeners.set(runId, set);
    queueMicrotask(() => {
      const run = this.runs.get(runId);
      if (run) listener.cb(clone(run));
      listener.ready = true;
    });
    return () => set.delete(listener);
  }

  watchEvaluations(runId: string, cb: (change: EvaluationChange) => void): Unsubscribe {
    const listener: Listener<EvaluationChange> = { cb, ready: false };
    const set = this.evalListeners.get(runId) ?? new Set<Listener<EvaluationChange>>();
    set.add(listener);
    this.evalListeners.set(runId, set);
    queueMicrotask(() => {
      const byKey = this.evaluations.get(runId);
      if (byKey) {
        for (const evaluation of byKey.values()) {
          listener.cb({ type: "added", evaluation: clone(evaluation) });
        }
      }
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
      if (listener.ready) listener.cb(clone(run));
    }
  }

  private notifyEvaluation(runId: string, change: EvaluationChange): void {
    const set = this.evalListeners.get(runId);
    if (!set) return;
    for (const listener of set) {
      if (listener.ready) listener.cb({ type: change.type, evaluation: clone(change.evaluation) });
    }
  }
}

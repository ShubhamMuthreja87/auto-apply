/**
 * The persistence port the whole backend depends on — never `firebase-admin`
 * directly (CLAUDE.md, Persistence port). Two implementations satisfy it: the
 * Firestore adapter and an in-memory twin with the same subscription behaviour.
 * A single shared contract suite exercises both so they cannot drift.
 *
 * This is a backend-only port: the browser never sees a `Repo` (it talks HTTP
 * and SSE). The document shapes it moves — {@link Run}, {@link Evaluation} and
 * friends — live in `contract.ts` because those *do* travel to the browser.
 */
import type {
  Evaluation,
  EvaluationStatus,
  Run,
  RunFunnel,
  RunStatus,
  UserDoc,
  Verdict,
} from "./contract.js";

/** Returned by every `watch*` call; stops delivery and releases the listener. */
export type Unsubscribe = () => void;

/**
 * A forward-only patch to a Run. `funnelIncrements` are *added* to the current
 * counts — never an overwrite — so the Firestore adapter can map them to
 * `FieldValue.increment` (CODING_STANDARDS landmine: lost updates). `updatedAt`
 * is set by the adapter, not the caller.
 */
export interface RunDelta {
  status?: RunStatus;
  reason?: string | null;
  funnelIncrements?: Partial<RunFunnel>;
}

/** A patch to a single Evaluation. `updatedAt` is set by the adapter. */
export interface EvaluationDelta {
  status?: EvaluationStatus;
  verdict?: Verdict | null;
  score?: number | null;
  reason?: string | null;
}

/** Mirrors a Firestore collection change: how an Evaluation entered the stream. */
export type ChangeType = "added" | "modified" | "removed";

export interface EvaluationChange {
  type: ChangeType;
  evaluation: Evaluation;
}

/**
 * Thrown by `createRun` when the user already has an active Run. The route maps
 * it to `409` — one active run per user (D17). Carries the offending run id so
 * callers and logs can name it.
 */
export class ActiveRunExistsError extends Error {
  constructor(
    readonly uid: string,
    readonly activeRunId: string,
  ) {
    super(`user ${uid} already has an active run (${activeRunId})`);
    this.name = "ActiveRunExistsError";
  }
}

/**
 * The persistence contract. Writes echo back to live subscribers; each `watch*`
 * delivers an initial snapshot asynchronously (never synchronously), then
 * callbacks for later matching writes, in write order. Like Firestore's
 * `onSnapshot`, a backend may coalesce rapid writes into one callback, but it
 * never delivers a stale state after a newer one and the last callback always
 * reflects the latest write. (The in-memory twin delivers one per write.)
 */
export interface Repo {
  getUser(uid: string): Promise<UserDoc | null>;
  /** Seeds the user on first boot (D13); a no-op if the document already exists. */
  seedUserIfMissing(uid: string, doc: UserDoc): Promise<void>;

  /** Creates a Run; rejects with {@link ActiveRunExistsError} if one is active (D17). */
  createRun(run: Run): Promise<void>;
  getActiveRun(uid: string): Promise<Run | null>;
  patchRun(runId: string, delta: RunDelta): Promise<void>;

  putEvaluation(runId: string, evaluation: Evaluation): Promise<void>;
  patchEvaluation(runId: string, jobKey: string, delta: EvaluationDelta): Promise<void>;

  /** Seen spans Runs so dedupe survives across them (GLOSSARY: Seen, D15). */
  isSeen(jobKey: string): Promise<boolean>;
  markSeen(jobKey: string): Promise<void>;

  watchRun(runId: string, cb: (run: Run) => void): Unsubscribe;
  watchEvaluations(runId: string, cb: (change: EvaluationChange) => void): Unsubscribe;
}

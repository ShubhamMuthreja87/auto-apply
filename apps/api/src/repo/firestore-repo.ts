/**
 * The Firestore implementation of the `Repo` port, laid out per ADR-0001: every
 * collection hangs off the namespace root document, so nothing here builds a
 * path except through {@link nsDoc}. Reads are zod-validated against the
 * contract; funnel counts use `FieldValue.increment` and each Evaluation is its
 * own document, so concurrent pipeline steps never lose updates.
 */
import {
  FieldValue,
  type CollectionReference,
  type DocumentReference,
  type Firestore,
  type Query,
} from "firebase-admin/firestore";
import { z } from "zod";
import {
  ActiveRunExistsError,
  evaluationSchema,
  isRunActive,
  runSchema,
  userDocSchema,
  type Evaluation,
  type EvaluationChange,
  type EvaluationDelta,
  type Repo,
  type Run,
  type RunDelta,
  type SubscriptionErrorHandler,
  type Unsubscribe,
  type UserDoc,
} from "@auto-apply/shared";
import { nsDoc } from "../firestore/firestore.js";

/** gRPC status for a `create()` on a document that already exists. */
const ALREADY_EXISTS = 6;

interface Snapshot {
  data(): unknown;
  ref: { path: string };
}

/** Validates a document read against the contract (ADR-0003: never trusted). */
function validate<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, snap: Snapshot): T | Error {
  const parsed = schema.safeParse(snap.data());
  return parsed.success
    ? parsed.data
    : new Error(`invalid document at ${snap.ref.path}: ${parsed.error.message}`);
}

/** For direct reads: a bad document rejects the caller's promise. */
function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, snap: Snapshot): T {
  const valid = validate(schema, snap);
  if (valid instanceof Error) throw valid;
  return valid;
}

/** The user's active Run among their runs, if any (D17). */
function findActiveRun(runs: { docs: Snapshot[] }): Run | undefined {
  return runs.docs.map((snap) => parse(runSchema, snap)).find((run) => isRunActive(run.status));
}

export class FirestoreRepo implements Repo {
  private readonly root: DocumentReference;

  constructor(db: Firestore, namespace: string) {
    this.root = nsDoc(db, namespace);
  }

  async getUser(uid: string): Promise<UserDoc | null> {
    const snap = await this.users().doc(uid).get();
    return snap.exists ? parse(userDocSchema, snap) : null;
  }

  async seedUserIfMissing(uid: string, doc: UserDoc): Promise<void> {
    try {
      await this.users().doc(uid).create(doc);
    } catch (err) {
      if (isAlreadyExists(err)) return;
      throw err;
    }
  }

  async createRun(run: Run): Promise<void> {
    // A transaction so two racing creates (a double click) cannot both pass
    // the active-run check (D17). The query filters by uid only and checks
    // status in code: a user has few runs, and no composite index is needed.
    await this.root.firestore.runTransaction(async (tx) => {
      const active = findActiveRun(await tx.get(this.runsOf(run.uid)));
      if (active) throw new ActiveRunExistsError(run.uid, active.runId);
      tx.create(this.runs().doc(run.runId), run);
    });
  }

  async getRun(runId: string): Promise<Run | null> {
    const snap = await this.runs().doc(runId).get();
    return snap.exists ? parse(runSchema, snap) : null;
  }

  async getActiveRun(uid: string): Promise<Run | null> {
    return findActiveRun(await this.runsOf(uid).get()) ?? null;
  }

  async patchRun(runId: string, delta: RunDelta): Promise<void> {
    const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (delta.status !== undefined) update.status = delta.status;
    if (delta.reason !== undefined) update.reason = delta.reason;
    for (const [key, by] of Object.entries(delta.funnelIncrements ?? {})) {
      if (by !== undefined) update[`funnel.${key}`] = FieldValue.increment(by);
    }
    await this.runs().doc(runId).update(update);
  }

  async listRuns(uid: string): Promise<Run[]> {
    // Sorted in code, like `createRun`'s check: no composite index is needed.
    const snap = await this.runsOf(uid).get();
    return snap.docs
      .map((doc) => parse(runSchema, doc))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async putEvaluation(runId: string, evaluation: Evaluation): Promise<void> {
    await this.jobs(runId).doc(evaluation.jobKey).set(evaluation);
  }

  async patchEvaluation(runId: string, jobKey: string, delta: EvaluationDelta): Promise<void> {
    const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (delta.status !== undefined) update.status = delta.status;
    if (delta.verdict !== undefined) update.verdict = delta.verdict;
    if (delta.score !== undefined) update.score = delta.score;
    if (delta.reason !== undefined) update.reason = delta.reason;
    if (delta.evidence !== undefined) update.evidence = delta.evidence;
    if (delta.scoredBy !== undefined) update.scoredBy = delta.scoredBy;
    if (delta.missingFields !== undefined) update.missingFields = delta.missingFields;
    if (delta.submission !== undefined) update.submission = delta.submission;
    await this.jobs(runId).doc(jobKey).update(update);
  }

  async listEvaluations(runId: string): Promise<Evaluation[]> {
    const snap = await this.jobs(runId).orderBy("createdAt").get();
    return snap.docs.map((doc) => parse(evaluationSchema, doc));
  }

  async isSeen(jobKey: string): Promise<boolean> {
    return (await this.seen().doc(jobKey).get()).exists;
  }

  async markSeen(jobKey: string): Promise<void> {
    await this.seen().doc(jobKey).set({ seenAt: new Date().toISOString() });
  }

  // In both watches, a bad document goes to `onError` and the listener keeps
  // running; a listener failure (Firestore's error callback) ends it, and
  // `onError` is the subscriber's only signal (ADR-0003).
  watchRun(runId: string, cb: (run: Run) => void, onError: SubscriptionErrorHandler): Unsubscribe {
    return this.runs()
      .doc(runId)
      .onSnapshot((snap) => {
        if (!snap.exists) return;
        const run = validate(runSchema, snap);
        if (run instanceof Error) onError(run);
        else cb(run);
      }, onError);
  }

  watchEvaluations(
    runId: string,
    cb: (changes: EvaluationChange[]) => void,
    onError: SubscriptionErrorHandler,
  ): Unsubscribe {
    // Ordered by creation so the initial snapshot replays evaluations in the
    // order they were added (Firestore breaks ties by document id).
    const query = this.jobs(runId).orderBy("createdAt");
    return query.onSnapshot(
      (snap) => {
        const changes: EvaluationChange[] = [];
        for (const change of snap.docChanges()) {
          const evaluation = validate(evaluationSchema, change.doc);
          if (evaluation instanceof Error) onError(evaluation);
          else changes.push({ type: change.type, evaluation });
        }
        cb(changes);
      },
      onError,
    );
  }

  private users(): CollectionReference {
    return this.root.collection("users");
  }

  private runs(): CollectionReference {
    return this.root.collection("runs");
  }

  private runsOf(uid: string): Query {
    return this.runs().where("uid", "==", uid);
  }

  private jobs(runId: string): CollectionReference {
    return this.runs().doc(runId).collection("jobs");
  }

  private seen(): CollectionReference {
    return this.root.collection("seen");
  }
}

function isAlreadyExists(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === ALREADY_EXISTS;
}

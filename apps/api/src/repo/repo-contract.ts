/**
 * The shared `Repo` contract suite. Any implementation must pass it, so the
 * in-memory twin cannot drift from Firestore semantics. Call
 * {@link describeRepoContract} with a factory that returns a fresh, empty repo
 * (and an optional teardown); it runs against the in-memory repo and, when
 * credentials are present, the Firestore adapter in a disposable `test-*`
 * namespace.
 *
 * Live updates are asserted the way a real `onSnapshot` delivers them: they
 * arrive *eventually* (polled), in write order, and a backend may coalesce
 * rapid writes into one callback — but never deliver a stale state after a
 * newer one, and the last callback always reflects the latest write.
 *
 * This file imports Vitest, so it is test support, not product code: it is
 * excluded from the API build and never imported outside a `*.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ActiveRunExistsError,
  emptyFunnel,
  jobKey,
  type CriterionEvidence,
  type Evaluation,
  type EvaluationChange,
  type Posting,
  type Repo,
  type Run,
  type RunStatus,
  type EvaluationStatus,
  type UserDoc,
} from "@auto-apply/shared";

export interface RepoHarness {
  repo: Repo;
  teardown?: () => Promise<void> | void;
}

export interface RepoContractOptions {
  /** Per-test timeout; a networked backend needs more than Vitest's 5 s. */
  testTimeoutMs?: number;
  /**
   * How long to wait for deliveries that must *not* happen (after unsubscribe,
   * from another run). Long enough for the backend's listener round trip.
   */
  quietMs?: number;
  /** How long a positive delivery may take before the assertion fails. */
  deliveryTimeoutMs?: number;
}

/**
 * Asserts `actual` is `expected` with some entries possibly coalesced away:
 * an in-order subsequence that ends on `expected`'s last entry.
 */
function expectCoalescedInOrder<T>(actual: readonly T[], expected: readonly T[]): void {
  expect(actual.at(-1)).toEqual(expected.at(-1));
  let cursor = 0;
  for (const value of actual) {
    while (cursor < expected.length && expected[cursor] !== value) cursor++;
    expect(
      cursor,
      `${JSON.stringify(actual)} is not in the order of ${JSON.stringify(expected)}`,
    ).toBeLessThan(expected.length);
    cursor++;
  }
}

function aUser(overrides: Partial<UserDoc> = {}): UserDoc {
  return { uid: "user-1", profile: {}, preferences: {}, settings: {}, ...overrides };
}

function aRun(overrides: Partial<Run> = {}): Run {
  const now = new Date().toISOString();
  return {
    runId: "run-1",
    uid: "user-1",
    status: "discovering",
    funnel: emptyFunnel(),
    reason: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function aPosting(jobId = "1"): Posting {
  return {
    ats: "greenhouse",
    board: "acme",
    jobId,
    title: "Staff Engineer",
    company: "Acme",
    location: "Remote",
    descriptionText: "Build things.",
    applyUrl: `https://boards.greenhouse.io/acme/jobs/${jobId}`,
    remote: true,
    source: "live",
  };
}

const evidenceItem: CriterionEvidence = {
  criterionId: "startup",
  label: "Startup or scale-up",
  weight: 1,
  judgedBy: "ai",
  met: true,
  evidence: "a fast-growing scale-up",
  points: 1,
};

function anEvaluation(posting: Posting, overrides: Partial<Evaluation> = {}): Evaluation {
  const now = new Date().toISOString();
  return {
    jobKey: jobKey(posting),
    runId: "run-1",
    posting,
    status: "queued",
    verdict: null,
    score: null,
    reason: null,
    evidence: [],
    scoredBy: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function describeRepoContract(
  name: string,
  createHarness: () => Promise<RepoHarness> | RepoHarness,
  options: RepoContractOptions = {},
): void {
  const { testTimeoutMs = 5_000, quietMs = 20, deliveryTimeoutMs = 1_000 } = options;

  /** Waits out any in-flight delivery before a "nothing arrived" assertion. */
  const settle = () => new Promise<void>((resolve) => setTimeout(resolve, quietMs));
  /** Retries `assertion` until it passes or the delivery timeout runs out. */
  const eventually = (assertion: () => void) =>
    vi.waitFor(assertion, { timeout: deliveryTimeoutMs, interval: 10 });

  describe(`Repo contract: ${name}`, { timeout: testTimeoutMs }, () => {
    let repo: Repo;
    let teardown: (() => Promise<void> | void) | undefined;

    beforeEach(async () => {
      const harness = await createHarness();
      repo = harness.repo;
      teardown = harness.teardown;
    });

    // Healthy subscriptions must never report an error; the tests that expect
    // one pass their own handler instead of this one.
    let unexpectedErrors: Error[] = [];
    const recordUnexpected = (error: Error) => unexpectedErrors.push(error);

    afterEach(async () => {
      try {
        expect(unexpectedErrors.map((e) => e.message)).toEqual([]);
      } finally {
        unexpectedErrors = [];
        await teardown?.();
      }
    });

    describe("users", () => {
      it("returns null before a user is seeded, then the seeded document", async () => {
        expect(await repo.getUser("user-1")).toBeNull();
        await repo.seedUserIfMissing("user-1", aUser({ profile: { title: "Staff" } }));
        const user = await repo.getUser("user-1");
        expect(user?.uid).toBe("user-1");
        expect(user?.profile).toEqual({ title: "Staff" });
      });

      it("leaves an existing user untouched on a second seed", async () => {
        await repo.seedUserIfMissing("user-1", aUser({ profile: { title: "Staff" } }));
        await repo.seedUserIfMissing("user-1", aUser({ profile: { title: "Overwritten" } }));
        const user = await repo.getUser("user-1");
        expect(user?.profile).toEqual({ title: "Staff" });
      });
    });

    describe("getRun", () => {
      it("returns null for an unknown run, then the run once created", async () => {
        expect(await repo.getRun("run-1")).toBeNull();
        await repo.createRun(aRun());
        await repo.patchRun("run-1", { status: "evaluating" });
        const run = await repo.getRun("run-1");
        expect(run?.runId).toBe("run-1");
        expect(run?.status).toBe("evaluating");
      });
    });

    describe("active run (the future 409, D17)", () => {
      it("has no active run initially and reports one after createRun", async () => {
        expect(await repo.getActiveRun("user-1")).toBeNull();
        await repo.createRun(aRun());
        expect((await repo.getActiveRun("user-1"))?.runId).toBe("run-1");
      });

      it("rejects a second concurrent run for the same user", async () => {
        await repo.createRun(aRun());
        await expect(repo.createRun(aRun({ runId: "run-2" }))).rejects.toBeInstanceOf(
          ActiveRunExistsError,
        );
      });

      it("lets exactly one of two racing createRun calls win (double click)", async () => {
        const results = await Promise.allSettled([
          repo.createRun(aRun({ runId: "run-a" })),
          repo.createRun(aRun({ runId: "run-b" })),
        ]);
        const rejected = results.filter((r) => r.status === "rejected");
        expect(rejected).toHaveLength(1);
        expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ActiveRunExistsError);
      });

      it("allows a new run once the previous one is terminal", async () => {
        await repo.createRun(aRun());
        await repo.patchRun("run-1", { status: "completed" });
        expect(await repo.getActiveRun("user-1")).toBeNull();
        await expect(repo.createRun(aRun({ runId: "run-3" }))).resolves.toBeUndefined();
      });

      it("isolates active runs by user", async () => {
        await repo.createRun(aRun());
        await repo.createRun(aRun({ runId: "run-b", uid: "user-2" }));
        expect((await repo.getActiveRun("user-2"))?.runId).toBe("run-b");
      });
    });

    describe("seen (dedupe across runs, D15)", () => {
      it("records and reports seen Job Keys independently", async () => {
        expect(await repo.isSeen("greenhouse:acme:1")).toBe(false);
        await repo.markSeen("greenhouse:acme:1");
        expect(await repo.isSeen("greenhouse:acme:1")).toBe(true);
        expect(await repo.isSeen("greenhouse:acme:2")).toBe(false);
      });
    });

    describe("funnel counts (D16)", () => {
      it("increments rather than overwrites", async () => {
        await repo.createRun(aRun());
        await repo.patchRun("run-1", { funnelIncrements: { discovered: 5 } });
        await repo.patchRun("run-1", { funnelIncrements: { discovered: 3, submitted: 1 } });
        const run = await repo.getActiveRun("user-1");
        expect(run?.funnel.discovered).toBe(8);
        expect(run?.funnel.submitted).toBe(1);
        expect(run?.funnel.blocked).toBe(0);
      });

      it("loses no update when increments race (no read-modify-write)", async () => {
        await repo.createRun(aRun());
        await Promise.all(
          Array.from({ length: 10 }, () =>
            repo.patchRun("run-1", { funnelIncrements: { evaluated: 1 } }),
          ),
        );
        expect((await repo.getActiveRun("user-1"))?.funnel.evaluated).toBe(10);
      });
    });

    describe("watchRun", () => {
      it("delivers the initial snapshot asynchronously, never synchronously", async () => {
        await repo.createRun(aRun());
        const seen: Run[] = [];
        const unsub = repo.watchRun("run-1", (run) => seen.push(run), recordUnexpected);
        expect(seen).toHaveLength(0);
        await eventually(() => expect(seen).toHaveLength(1));
        expect(seen[0]?.status).toBe("discovering");
        unsub();
      });

      it("echoes later writes back in write order, ending on the latest", async () => {
        await repo.createRun(aRun());
        const statuses: string[] = [];
        const unsub = repo.watchRun("run-1", (run) => statuses.push(run.status), recordUnexpected);
        await eventually(() => expect(statuses).toEqual(["discovering"]));
        statuses.length = 0;
        await repo.patchRun("run-1", { status: "evaluating" });
        await repo.patchRun("run-1", { status: "applying" });
        await repo.patchRun("run-1", { status: "completed" });
        await eventually(() => expect(statuses.at(-1)).toBe("completed"));
        expectCoalescedInOrder(statuses, ["evaluating", "applying", "completed"]);
        unsub();
      });

      it("never delivers a stale state after a write that races the initial snapshot", async () => {
        await repo.createRun(aRun());
        const statuses: string[] = [];
        const unsub = repo.watchRun("run-1", (run) => statuses.push(run.status), recordUnexpected);
        // Lands before (in memory: always; Firestore: usually) the initial snapshot.
        await repo.patchRun("run-1", { status: "evaluating" });
        await eventually(() => expect(statuses.at(-1)).toBe("evaluating"));
        expectCoalescedInOrder(statuses, ["discovering", "evaluating"]);
        unsub();
      });

      it("stops delivering after unsubscribe", async () => {
        await repo.createRun(aRun());
        const statuses: string[] = [];
        const unsub = repo.watchRun("run-1", (run) => statuses.push(run.status), recordUnexpected);
        await eventually(() => expect(statuses).toEqual(["discovering"]));
        unsub();
        await repo.patchRun("run-1", { status: "evaluating" });
        await settle();
        expect(statuses).toEqual(["discovering"]);
      });
    });

    describe("watchRun errors (ADR-0003)", () => {
      it("reports an invalid run to onError instead of delivering it, then keeps going", async () => {
        await repo.createRun(aRun());
        const statuses: string[] = [];
        const errors: Error[] = [];
        const unsub = repo.watchRun(
          "run-1",
          (run) => statuses.push(run.status),
          (error) => errors.push(error),
        );
        await eventually(() => expect(statuses).toEqual(["discovering"]));
        // A write that breaks the contract shape (a corrupted document).
        await repo.patchRun("run-1", { status: "exploded" as RunStatus });
        await eventually(() => expect(errors).toHaveLength(1));
        expect(errors[0]).toBeInstanceOf(Error);
        expect(statuses).toEqual(["discovering"]);
        // The subscription survives a bad document.
        await repo.patchRun("run-1", { status: "evaluating" });
        await eventually(() => expect(statuses.at(-1)).toBe("evaluating"));
        unsub();
      });
    });

    describe("watchEvaluations", () => {
      it("always delivers an initial batch, empty for a run with no evaluations", async () => {
        await repo.createRun(aRun());
        const batches: EvaluationChange[][] = [];
        const unsub = repo.watchEvaluations(
          "run-1",
          (batch) => batches.push(batch),
          recordUnexpected,
        );
        expect(batches).toHaveLength(0);
        await eventually(() => expect(batches).toEqual([[]]));
        unsub();
      });

      it("delivers the initial snapshot as one batch", async () => {
        await repo.createRun(aRun());
        await repo.putEvaluation("run-1", anEvaluation(aPosting("1")));
        await repo.putEvaluation("run-1", anEvaluation(aPosting("2")));
        const batches: EvaluationChange[][] = [];
        const unsub = repo.watchEvaluations(
          "run-1",
          (batch) => batches.push(batch),
          recordUnexpected,
        );
        await eventually(() => expect(batches).toHaveLength(1));
        expect(batches[0]).toHaveLength(2);
        unsub();
      });

      it("replays existing evaluations as 'added' in insertion order", async () => {
        await repo.createRun(aRun());
        const p1 = aPosting("1");
        const p2 = aPosting("2");
        await repo.putEvaluation("run-1", anEvaluation(p1));
        await repo.putEvaluation("run-1", anEvaluation(p2));
        const changes: EvaluationChange[] = [];
        const unsub = repo.watchEvaluations(
          "run-1",
          (batch) => changes.push(...batch),
          recordUnexpected,
        );
        expect(changes).toHaveLength(0);
        await eventually(() => expect(changes).toHaveLength(2));
        expect(changes.map((c) => c.type)).toEqual(["added", "added"]);
        expect(changes.map((c) => c.evaluation.jobKey)).toEqual([jobKey(p1), jobKey(p2)]);
        unsub();
      });

      it("streams later writes as deltas in order with the right change type", async () => {
        await repo.createRun(aRun());
        const posting = aPosting("1");
        const changes: EvaluationChange[] = [];
        const unsub = repo.watchEvaluations(
          "run-1",
          (batch) => changes.push(...batch),
          recordUnexpected,
        );
        await settle();
        await repo.putEvaluation("run-1", anEvaluation(posting));
        await repo.patchEvaluation("run-1", jobKey(posting), { status: "evaluating" });
        await repo.patchEvaluation("run-1", jobKey(posting), {
          status: "submitted",
          verdict: "APPLY_NOW",
          score: 42,
          evidence: [evidenceItem],
          scoredBy: "fallback",
        });
        await eventually(() => expect(changes.at(-1)?.evaluation.status).toBe("submitted"));
        // The first delivery introduces the document; every later one modifies it.
        expect(changes[0]?.type).toBe("added");
        expect(changes.slice(1).every((c) => c.type === "modified")).toBe(true);
        expectCoalescedInOrder(
          changes.map((c) => c.evaluation.status),
          ["queued", "evaluating", "submitted"],
        );
        expect(changes.at(-1)?.evaluation.verdict).toBe("APPLY_NOW");
        expect(changes.at(-1)?.evaluation.score).toBe(42);
        expect(changes.at(-1)?.evaluation.evidence).toEqual([evidenceItem]);
        expect(changes.at(-1)?.evaluation.scoredBy).toBe("fallback");
        unsub();
      });

      it("stops delivering after unsubscribe (no listener leak)", async () => {
        await repo.createRun(aRun());
        const changes: EvaluationChange[] = [];
        const unsub = repo.watchEvaluations(
          "run-1",
          (batch) => changes.push(...batch),
          recordUnexpected,
        );
        await settle();
        unsub();
        await repo.putEvaluation("run-1", anEvaluation(aPosting("1")));
        await settle();
        expect(changes).toHaveLength(0);
      });

      it("does not leak evaluations across runs", async () => {
        await repo.createRun(aRun());
        await repo.createRun(aRun({ runId: "run-2", uid: "user-2" }));
        const changes: EvaluationChange[] = [];
        const unsub = repo.watchEvaluations(
          "run-1",
          (batch) => changes.push(...batch),
          recordUnexpected,
        );
        await settle();
        await repo.putEvaluation("run-2", { ...anEvaluation(aPosting("9")), runId: "run-2" });
        await settle();
        expect(changes).toHaveLength(0);
        unsub();
      });

      it("reports an invalid evaluation to onError instead of delivering it, then keeps going", async () => {
        await repo.createRun(aRun());
        const posting = aPosting("1");
        const changes: EvaluationChange[] = [];
        const errors: Error[] = [];
        const unsub = repo.watchEvaluations(
          "run-1",
          (batch) => changes.push(...batch),
          (error) => errors.push(error),
        );
        await settle();
        await repo.putEvaluation("run-1", anEvaluation(posting));
        await eventually(() => expect(changes).toHaveLength(1));
        await repo.patchEvaluation("run-1", jobKey(posting), {
          status: "exploded" as EvaluationStatus,
        });
        await eventually(() => expect(errors).toHaveLength(1));
        expect(changes.map((c) => c.evaluation.status)).toEqual(["queued"]);
        await repo.patchEvaluation("run-1", jobKey(posting), { status: "evaluating" });
        await eventually(() => expect(changes.at(-1)?.evaluation.status).toBe("evaluating"));
        unsub();
      });
    });
    describe("listing (Scanned jobs, ticket 12)", () => {
      it("lists a user's runs newest first, and no other user's", async () => {
        await repo.createRun(aRun({ status: "completed", createdAt: "2026-10-01T10:00:00.000Z" }));
        await repo.createRun(
          aRun({ runId: "run-2", status: "failed", createdAt: "2026-10-03T10:00:00.000Z" }),
        );
        await repo.createRun(aRun({ runId: "run-3", createdAt: "2026-10-02T10:00:00.000Z" }));
        await repo.createRun(aRun({ runId: "run-9", uid: "user-2" }));

        const runs = await repo.listRuns("user-1");

        expect(runs.map((run) => run.runId)).toEqual(["run-2", "run-3", "run-1"]);
        expect(await repo.listRuns("nobody")).toEqual([]);
      });

      it("lists a run's evaluations in the order they were added, with their latest state", async () => {
        await repo.createRun(aRun());
        await repo.createRun(aRun({ runId: "run-2", uid: "user-2" }));
        await repo.putEvaluation(
          "run-1",
          anEvaluation(aPosting("1"), { createdAt: "2026-10-06T12:00:01.000Z" }),
        );
        await repo.putEvaluation(
          "run-1",
          anEvaluation(aPosting("2"), { createdAt: "2026-10-06T12:00:02.000Z" }),
        );
        await repo.putEvaluation("run-2", { ...anEvaluation(aPosting("9")), runId: "run-2" });
        await repo.patchEvaluation("run-1", jobKey(aPosting("1")), {
          status: "held",
          verdict: "APPLY",
          score: 6,
          evidence: [evidenceItem],
          scoredBy: "fallback",
        });

        const evaluations = await repo.listEvaluations("run-1");

        expect(evaluations.map((e) => e.posting.jobId)).toEqual(["1", "2"]);
        expect(evaluations[0]).toMatchObject({
          status: "held",
          verdict: "APPLY",
          score: 6,
          evidence: [evidenceItem],
          scoredBy: "fallback",
        });
        expect(await repo.listEvaluations("unknown-run")).toEqual([]);
      });
    });
  });
}

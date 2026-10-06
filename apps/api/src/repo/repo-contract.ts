/**
 * The shared `Repo` contract suite. Any implementation must pass it, so the
 * in-memory twin cannot drift from Firestore semantics. Call
 * {@link describeRepoContract} with a factory that returns a fresh, empty repo
 * (and an optional teardown) — ticket 02 runs it against the in-memory repo,
 * ticket 03 drops in the Firestore adapter in a disposable `test-*` namespace.
 *
 * This file imports Vitest, so it is test support, not product code: it is
 * excluded from the API build and never imported outside a `*.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ActiveRunExistsError,
  emptyFunnel,
  jobKey,
  type Evaluation,
  type EvaluationChange,
  type Posting,
  type Repo,
  type Run,
  type UserDoc,
} from "@auto-apply/shared";

export interface RepoHarness {
  repo: Repo;
  teardown?: () => Promise<void> | void;
}

/** Lets every microtask (and the current macrotask) drain before we assert. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
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
  };
}

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
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function describeRepoContract(
  name: string,
  createHarness: () => Promise<RepoHarness> | RepoHarness,
): void {
  describe(`Repo contract: ${name}`, () => {
    let repo: Repo;
    let teardown: (() => Promise<void> | void) | undefined;

    beforeEach(async () => {
      const harness = await createHarness();
      repo = harness.repo;
      teardown = harness.teardown;
    });

    afterEach(async () => {
      await teardown?.();
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
    });

    describe("watchRun", () => {
      it("delivers the initial snapshot on a microtask, not synchronously", async () => {
        await repo.createRun(aRun());
        const seen: Run[] = [];
        const unsub = repo.watchRun("run-1", (run) => seen.push(run));
        expect(seen).toHaveLength(0);
        await flush();
        expect(seen).toHaveLength(1);
        expect(seen[0]?.status).toBe("discovering");
        unsub();
      });

      it("echoes every later write back in order", async () => {
        await repo.createRun(aRun());
        const statuses: string[] = [];
        const unsub = repo.watchRun("run-1", (run) => statuses.push(run.status));
        await flush();
        statuses.length = 0;
        await repo.patchRun("run-1", { status: "evaluating" });
        await repo.patchRun("run-1", { status: "applying" });
        await repo.patchRun("run-1", { status: "completed" });
        expect(statuses).toEqual(["evaluating", "applying", "completed"]);
        unsub();
      });

      it("coalesces writes made before the initial snapshot into it", async () => {
        await repo.createRun(aRun());
        const statuses: string[] = [];
        const unsub = repo.watchRun("run-1", (run) => statuses.push(run.status));
        // Lands in the synchronous gap before the initial microtask fires.
        await repo.patchRun("run-1", { status: "evaluating" });
        await flush();
        expect(statuses).toEqual(["evaluating"]);
        unsub();
      });

      it("stops delivering after unsubscribe", async () => {
        await repo.createRun(aRun());
        const statuses: string[] = [];
        const unsub = repo.watchRun("run-1", (run) => statuses.push(run.status));
        await flush();
        unsub();
        await repo.patchRun("run-1", { status: "evaluating" });
        await flush();
        expect(statuses).toEqual(["discovering"]);
      });
    });

    describe("watchEvaluations", () => {
      it("replays existing evaluations as 'added' in insertion order", async () => {
        await repo.createRun(aRun());
        const p1 = aPosting("1");
        const p2 = aPosting("2");
        await repo.putEvaluation("run-1", anEvaluation(p1));
        await repo.putEvaluation("run-1", anEvaluation(p2));
        const changes: EvaluationChange[] = [];
        const unsub = repo.watchEvaluations("run-1", (change) => changes.push(change));
        expect(changes).toHaveLength(0);
        await flush();
        expect(changes.map((c) => c.type)).toEqual(["added", "added"]);
        expect(changes.map((c) => c.evaluation.jobKey)).toEqual([jobKey(p1), jobKey(p2)]);
        unsub();
      });

      it("streams later writes as deltas in order with the right change type", async () => {
        await repo.createRun(aRun());
        const posting = aPosting("1");
        const changes: EvaluationChange[] = [];
        const unsub = repo.watchEvaluations("run-1", (change) => changes.push(change));
        await flush();
        await repo.putEvaluation("run-1", anEvaluation(posting));
        await repo.patchEvaluation("run-1", jobKey(posting), { status: "evaluating" });
        await repo.patchEvaluation("run-1", jobKey(posting), {
          status: "submitted",
          verdict: "APPLY_NOW",
          score: 42,
        });
        expect(changes.map((c) => c.type)).toEqual(["added", "modified", "modified"]);
        expect(changes.map((c) => c.evaluation.status)).toEqual([
          "queued",
          "evaluating",
          "submitted",
        ]);
        expect(changes.at(-1)?.evaluation.verdict).toBe("APPLY_NOW");
        unsub();
      });

      it("stops delivering after unsubscribe (no listener leak)", async () => {
        await repo.createRun(aRun());
        const changes: EvaluationChange[] = [];
        const unsub = repo.watchEvaluations("run-1", (change) => changes.push(change));
        await flush();
        unsub();
        await repo.putEvaluation("run-1", anEvaluation(aPosting("1")));
        await flush();
        expect(changes).toHaveLength(0);
      });

      it("does not leak evaluations across runs", async () => {
        await repo.createRun(aRun());
        await repo.createRun(aRun({ runId: "run-2", uid: "user-2" }));
        const changes: EvaluationChange[] = [];
        const unsub = repo.watchEvaluations("run-1", (change) => changes.push(change));
        await flush();
        await repo.putEvaluation("run-2", { ...anEvaluation(aPosting("9")), runId: "run-2" });
        await flush();
        expect(changes).toHaveLength(0);
        unsub();
      });
    });
  });
}

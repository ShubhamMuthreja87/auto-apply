/**
 * Startup recovery (landmine: interrupted runs). A restart kills in-process
 * Runs, so whatever is still active in the repository at boot can never finish:
 * it is failed with reason `interrupted` before the API accepts requests.
 */
import { describe, expect, it } from "vitest";
import {
  emptyFunnel,
  jobKey,
  postingSchema,
  RUN_INTERRUPTED_REASON,
  type Evaluation,
  type EvaluationStatus,
  type Run,
} from "@auto-apply/shared";
import { InMemoryRepo } from "../repo/in-memory-repo.js";
import { RECOVERY_RUN_WINDOW, recoverInterruptedRuns } from "./recover-interrupted-runs.js";

function aRun(overrides: Partial<Run> = {}): Run {
  return {
    runId: "run-1",
    uid: "demo-user",
    status: "evaluating",
    funnel: { ...emptyFunnel(), discovered: 3, evaluated: 1 },
    reason: null,
    createdAt: "2026-10-06T12:00:00.000Z",
    updatedAt: "2026-10-06T12:00:00.000Z",
    ...overrides,
  };
}

function anEvaluation(
  jobId: string,
  status: EvaluationStatus,
  reason: string | null = null,
): Evaluation {
  const posting = postingSchema.parse({
    ats: "greenhouse",
    board: "acme",
    jobId,
    title: "Engineering Manager",
    company: "Acme",
    location: "Remote",
    descriptionText: "Lead a team.",
    applyUrl: `https://boards.greenhouse.io/acme/jobs/${jobId}`,
  });
  return {
    jobKey: jobKey(posting),
    runId: "run-1",
    posting,
    status,
    verdict: null,
    score: null,
    reason,
    evidence: [],
    scoredBy: null,
    missingFields: [],
    submission: null,
    createdAt: "2026-10-06T12:00:00.000Z",
    updatedAt: "2026-10-06T12:00:00.000Z",
  };
}

describe("recoverInterruptedRuns", () => {
  it.each(["discovering", "evaluating", "applying"] as const)(
    "fails a Run left %s before boot as interrupted, keeping its funnel",
    async (status) => {
      const repo = new InMemoryRepo();
      await repo.createRun(aRun({ status }));

      const recovered = await recoverInterruptedRuns(repo, ["demo-user"]);

      expect(recovered).toEqual(["run-1"]);
      expect(await repo.getRun("run-1")).toMatchObject({
        status: "failed",
        reason: "interrupted",
        funnel: { discovered: 3, evaluated: 1 },
      });
      expect(RUN_INTERRUPTED_REASON).toBe("interrupted");
      expect(await repo.getActiveRun("demo-user")).toBeNull();
    },
  );

  it("leaves finished Runs alone", async () => {
    const repo = new InMemoryRepo();
    await repo.createRun(aRun({ runId: "done-1", status: "completed" }));
    await repo.createRun(aRun({ runId: "done-2", status: "failed", reason: "boom" }));

    expect(await recoverInterruptedRuns(repo, ["demo-user"])).toEqual([]);
    expect(await repo.getRun("done-1")).toMatchObject({ status: "completed", reason: null });
    expect(await repo.getRun("done-2")).toMatchObject({ status: "failed", reason: "boom" });
  });

  it("lets the user start a new Run once the interrupted one is failed", async () => {
    const repo = new InMemoryRepo();
    await repo.createRun(aRun());

    await recoverInterruptedRuns(repo, ["demo-user"]);

    await expect(
      repo.createRun(aRun({ runId: "run-2", status: "discovering" })),
    ).resolves.toBeUndefined();
  });
  it("fails the interrupted Run's unfinished jobs as interrupted and counts them, leaving finished jobs alone", async () => {
    const repo = new InMemoryRepo();
    await repo.createRun(
      aRun({ status: "applying", funnel: { ...emptyFunnel(), discovered: 6, held: 1 } }),
    );
    const unfinished = [
      anEvaluation("1", "queued"),
      anEvaluation("2", "evaluating"),
      anEvaluation("3", "applying"),
    ];
    const finished = [
      anEvaluation("4", "held", "needs_you"),
      anEvaluation("5", "submitted"),
      anEvaluation("6", "failed", "simulated"),
    ];
    for (const evaluation of [...unfinished, ...finished]) {
      await repo.putEvaluation("run-1", evaluation);
    }

    await recoverInterruptedRuns(repo, ["demo-user"]);

    const byKey = new Map((await repo.listEvaluations("run-1")).map((e) => [e.posting.jobId, e]));
    for (const { posting } of unfinished) {
      expect(byKey.get(posting.jobId)).toMatchObject({ status: "failed", reason: "interrupted" });
    }
    expect(byKey.get("4")).toMatchObject({ status: "held", reason: "needs_you" });
    expect(byKey.get("5")).toMatchObject({ status: "submitted" });
    expect(byKey.get("6")).toMatchObject({ status: "failed", reason: "simulated" });
    expect((await repo.getRun("run-1"))?.funnel).toMatchObject({
      discovered: 6,
      held: 1,
      failed: 3,
    });
  });

  it("fails a Retry a restart cut off after its Run completed, and restores the failed count", async () => {
    const repo = new InMemoryRepo();
    // Retry moved the job back to `applying` and its count out of `failed` (D19)…
    await repo.createRun(
      aRun({ status: "completed", funnel: { ...emptyFunnel(), discovered: 2, submitted: 1 } }),
    );
    await repo.putEvaluation("run-1", anEvaluation("1", "applying"));
    await repo.putEvaluation("run-1", anEvaluation("2", "submitted"));

    // …and the server restarted before the simulated send finished.
    const recovered = await recoverInterruptedRuns(repo, ["demo-user"]);

    expect(recovered).toEqual([]);
    const byKey = new Map((await repo.listEvaluations("run-1")).map((e) => [e.posting.jobId, e]));
    expect(byKey.get("1")).toMatchObject({ status: "failed", reason: "interrupted" });
    expect(byKey.get("2")).toMatchObject({ status: "submitted" });
    expect(await repo.getRun("run-1")).toMatchObject({
      status: "completed",
      funnel: { submitted: 1, failed: 1 },
    });
  });

  it("only looks at the user's most recent Runs (bounded)", async () => {
    const repo = new InMemoryRepo();
    for (let i = 1; i <= RECOVERY_RUN_WINDOW + 1; i++) {
      const runId = `run-${i}`;
      await repo.createRun(
        aRun({ runId, status: "completed", createdAt: `2026-10-0${i}T12:00:00.000Z` }),
      );
      await repo.putEvaluation(runId, { ...anEvaluation("1", "applying"), runId });
    }

    await recoverInterruptedRuns(repo, ["demo-user"]);

    const statusIn = async (runId: string) => (await repo.listEvaluations(runId))[0]?.status;
    expect(await statusIn("run-1")).toBe("applying");
    for (let i = 2; i <= RECOVERY_RUN_WINDOW + 1; i++) {
      expect(await statusIn(`run-${i}`)).toBe("failed");
    }
  });
});

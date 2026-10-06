/**
 * Startup recovery (landmine: interrupted runs). A restart kills in-process
 * Runs, so whatever is still active in the repository at boot can never finish:
 * it is failed with reason `interrupted` before the API accepts requests.
 */
import { describe, expect, it } from "vitest";
import { emptyFunnel, RUN_INTERRUPTED_REASON, type Run } from "@auto-apply/shared";
import { InMemoryRepo } from "../repo/in-memory-repo.js";
import { recoverInterruptedRuns } from "./recover-interrupted-runs.js";

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
});

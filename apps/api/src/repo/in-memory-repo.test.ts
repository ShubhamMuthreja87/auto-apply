import { describe, expect, it } from "vitest";
import { emptyFunnel } from "@auto-apply/shared";
import { InMemoryRepo } from "./in-memory-repo.js";
import { describeRepoContract } from "./repo-contract.js";

describeRepoContract("InMemoryRepo", () => ({ repo: new InMemoryRepo() }));

describe("InMemoryRepo beyond the contract", () => {
  it("delivers exactly one callback per write, never coalescing", async () => {
    const repo = new InMemoryRepo();
    const now = new Date().toISOString();
    await repo.createRun({
      runId: "run-1",
      uid: "user-1",
      status: "discovering",
      funnel: emptyFunnel(),
      reason: null,
      createdAt: now,
      updatedAt: now,
    });
    const statuses: string[] = [];
    const errors: Error[] = [];
    const unsub = repo.watchRun(
      "run-1",
      (run) => statuses.push(run.status),
      (error) => errors.push(error),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    await repo.patchRun("run-1", { status: "evaluating" });
    await repo.patchRun("run-1", { status: "applying" });
    expect(statuses).toEqual(["discovering", "evaluating", "applying"]);
    expect(errors).toEqual([]);
    unsub();
  });
});

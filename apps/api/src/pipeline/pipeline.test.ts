import { describe, expect, it } from "vitest";
import {
  ActiveRunExistsError,
  type Evaluation,
  type Posting,
  type Run,
  type RunStatus,
  type User,
} from "@auto-apply/shared";
import { createDiscovery } from "../discovery/discovery.js";
import { readBoardFixture } from "../discovery/fixtures.js";
import { greenhouseJobSource } from "../discovery/greenhouse.js";
import { recordedFetch } from "../discovery/recorded-fetch.js";
import { InMemoryRepo } from "../repo/in-memory-repo.js";
import { buildPipeline, type PipelineDeps } from "./pipeline.js";
import type { Discovery } from "./ports.js";
import { SEED_USER } from "../seed-user.js";
import { UserNotFoundError } from "../user.js";

const theUser: User = { uid: "user-1", ...SEED_USER };

function aPosting(jobId: string): Posting {
  return {
    ats: "greenhouse",
    board: "acme",
    jobId,
    title: "Engineer",
    company: "Acme",
    location: "Remote",
    descriptionText: "Build things.",
    applyUrl: `https://boards.greenhouse.io/acme/jobs/${jobId}`,
    remote: true,
    source: "live",
  };
}

const twoPostings: Discovery = { discover: async () => [aPosting("1"), aPosting("2")] };

/** A `delay` that holds every step until the test releases it. */
function gatedDelay() {
  let release: () => void = () => {};
  let gate = new Promise<void>((resolve) => (release = resolve));
  return {
    delay: () => gate,
    open: () => {
      release();
      gate = Promise.resolve();
    },
  };
}

function deps(overrides: Partial<PipelineDeps> = {}): PipelineDeps {
  let n = 0;
  return {
    repo: new InMemoryRepo(),
    discovery: twoPostings,
    clock: () => new Date("2026-10-06T12:00:00.000Z"),
    delay: async () => {},
    newRunId: () => `run-${++n}`,
    loadUser: async () => theUser,
    ...overrides,
  };
}

/** Run statuses in the order they were written, repeats (funnel patches) collapsed. */
function recordStatuses(repo: InMemoryRepo, runId: string) {
  const statuses: RunStatus[] = [];
  const unsub = repo.watchRun(
    runId,
    (run: Run) => {
      if (statuses.at(-1) !== run.status) statuses.push(run.status);
    },
    (error) => {
      throw error;
    },
  );
  return { statuses, unsub };
}

describe("pipeline skeleton", () => {
  it("creates the Run and returns before the long work finishes", async () => {
    const gated = gatedDelay();
    const d = deps({ delay: gated.delay });
    const pipeline = buildPipeline(d);

    const { runId, finished } = await pipeline.startRun("user-1");

    const run = await d.repo.getRun(runId);
    expect(run).toMatchObject({ runId: "run-1", uid: "user-1", status: "discovering" });
    expect(run?.createdAt).toBe("2026-10-06T12:00:00.000Z");
    gated.open();
    await finished;
  });

  it("moves the Run discovering → evaluating → applying → completed with funnel counts", async () => {
    const gated = gatedDelay();
    const repo = new InMemoryRepo();
    const pipeline = buildPipeline(deps({ repo, delay: gated.delay }));

    const { runId, finished } = await pipeline.startRun("user-1");
    const { statuses, unsub } = recordStatuses(repo, runId);
    gated.open();
    await finished;
    unsub();

    expect(statuses).toEqual(["discovering", "evaluating", "applying", "completed"]);
    const run = await repo.getRun(runId);
    expect(run?.funnel).toEqual({
      discovered: 2,
      evaluated: 2,
      blocked: 0,
      skipped: 2,
      held: 0,
      submitted: 0,
      failed: 0,
    });
  });

  it("records an Evaluation per discovered Posting, each ending with a status and reason", async () => {
    const repo = new InMemoryRepo();
    const pipeline = buildPipeline(deps({ repo }));

    const { runId, finished } = await pipeline.startRun("user-1");
    await finished;

    const evaluations = await new Promise<string[]>((resolve) => {
      const unsub = repo.watchEvaluations(
        runId,
        (batch) => {
          unsub();
          resolve(batch.map((c) => `${c.evaluation.jobKey} ${c.evaluation.status}`));
        },
        () => {},
      );
    });
    expect(evaluations).toEqual(["greenhouse:acme:1 skipped", "greenhouse:acme:2 skipped"]);
  });

  it("rejects a second Run while one is active (D17)", async () => {
    const gated = gatedDelay();
    const pipeline = buildPipeline(deps({ delay: gated.delay }));

    const first = await pipeline.startRun("user-1");
    await expect(pipeline.startRun("user-1")).rejects.toBeInstanceOf(ActiveRunExistsError);
    gated.open();
    await first.finished;
    // Once the first Run is terminal, a new one may start.
    const next = await pipeline.startRun("user-1");
    expect(next.runId).not.toBe(first.runId);
    await next.finished;
  });

  it("fails the Run with a reason when discovery throws, instead of crashing", async () => {
    const repo = new InMemoryRepo();
    const broken: Discovery = {
      discover: async () => {
        throw new Error("board unreachable");
      },
    };
    const pipeline = buildPipeline(deps({ repo, discovery: broken }));

    const { runId, finished } = await pipeline.startRun("user-1");
    await finished;

    const run = await repo.getRun(runId);
    expect(run?.status).toBe("failed");
    expect(run?.reason).toBe("board unreachable");
  });

  it("loads the Run's user through the injected loader, by the Run's uid", async () => {
    const asked: string[] = [];
    const pipeline = buildPipeline(
      deps({
        loadUser: async (uid) => {
          asked.push(uid);
          return theUser;
        },
      }),
    );

    const { finished } = await pipeline.startRun("user-1");
    await finished;

    expect(asked).toEqual(["user-1"]);
  });

  it("fails the Run with a reason when the user document cannot be loaded", async () => {
    const repo = new InMemoryRepo();
    const pipeline = buildPipeline(
      deps({
        repo,
        loadUser: async (uid) => {
          throw new UserNotFoundError(uid);
        },
      }),
    );

    const { runId, finished } = await pipeline.startRun("user-1");
    await finished;

    const run = await repo.getRun(runId);
    expect(run?.status).toBe("failed");
    expect(run?.reason).toBe("no user document for user-1");
    expect(run?.funnel.discovered).toBe(0);
  });
});

describe("pipeline with real discovery over recorded boards", () => {
  it("queues an Evaluation per discovered Posting, a failed board labelled fallback (D3)", async () => {
    const repo = new InMemoryRepo();
    const recorded = recordedFetch({ failing: ["anthropic"] });
    const discovery = createDiscovery({
      sources: [greenhouseJobSource({ fetch: recorded.fetch, timeoutMs: 1000 })],
      boards: [
        { ats: "greenhouse", board: "stripe" },
        { ats: "greenhouse", board: "anthropic" },
      ],
      readFixture: readBoardFixture,
      mode: "live",
    });
    const pipeline = buildPipeline(deps({ repo, discovery }));

    const { runId, finished } = await pipeline.startRun("user-1");
    await finished;

    const evaluations = await new Promise<Evaluation[]>((resolve) => {
      const unsub = repo.watchEvaluations(
        runId,
        (batch) => {
          unsub();
          resolve(batch.map((c) => c.evaluation));
        },
        () => {},
      );
    });
    const sources = new Map(evaluations.map((e) => [e.posting.board, e.posting.source]));
    expect(sources).toEqual(
      new Map([
        ["stripe", "live"],
        ["anthropic", "fallback"],
      ]),
    );
    expect(evaluations.map((e) => e.jobKey)).toContain("greenhouse:stripe:8113337");
    const run = await repo.getRun(runId);
    expect(run?.status).toBe("completed");
    expect(run?.funnel.discovered).toBe(evaluations.length);
    expect(recorded.calls.every((c) => c.method === "GET")).toBe(true);
  });
});

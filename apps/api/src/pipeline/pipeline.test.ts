import { describe, expect, it, vi } from "vitest";
import {
  ActiveRunExistsError,
  MAX_AI_EVALS,
  MAX_IN_FLIGHT,
  jobKey,
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
import { keywordMatcher } from "../evaluation/keyword-matcher.js";
import { createAiEvaluator } from "../ai/ai-evaluator.js";
import { createChatClient } from "../ai/chat-client.js";
import { completion, readAiFixture, scriptedFetch } from "../ai/scripted-fetch.js";
import { InMemoryRepo } from "../repo/in-memory-repo.js";
import { AWAITING_SUBMIT_REASON, buildPipeline, type PipelineDeps } from "./pipeline.js";
import type { Discovery, JobEvaluator } from "./ports.js";
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

/** An evaluator that records which Postings it was asked to judge. */
function recordingEvaluator() {
  const judged: string[] = [];
  const evaluator: JobEvaluator = {
    evaluate: async (posting) => {
      judged.push(posting.jobId);
      return { scoredBy: "fallback", judgements: [] };
    },
  };
  return { evaluator, judged };
}

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
    evaluator: recordingEvaluator().evaluator,
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
/** The Run's Evaluations as they stand now, in the order they were first written. */
function evaluationsOf(repo: InMemoryRepo, runId: string): Promise<Evaluation[]> {
  return new Promise<Evaluation[]>((resolve, reject) => {
    const unsub = repo.watchEvaluations(
      runId,
      (batch) => {
        unsub();
        resolve(batch.map((c) => c.evaluation));
      },
      reject,
    );
  });
}

function outcomes(evaluations: Evaluation[]): Record<string, string> {
  return Object.fromEntries(
    evaluations.map((e) => [e.posting.jobId, `${e.status}: ${e.reason ?? ""}`]),
  );
}

function postings(count: number, overrides: Partial<Posting> = {}, prefix = ""): Posting[] {
  return Array.from({ length: count }, (_, i) => ({
    ...aPosting(`${prefix}${i + 1}`),
    ...overrides,
  }));
}

const onsiteAbroad: Partial<Posting> = {
  location: "San Francisco, CA",
  remote: false,
};

describe("seen-skip (D15)", () => {
  it("skips Postings evaluated in an earlier Run before any screening or evaluation", async () => {
    const repo = new InMemoryRepo();
    const { evaluator, judged } = recordingEvaluator();
    const discovery: Discovery = {
      discover: async () => [aPosting("1"), { ...aPosting("2"), ...onsiteAbroad }],
    };
    const pipeline = buildPipeline(deps({ repo, evaluator, discovery }));

    const first = await pipeline.startRun("user-1");
    await first.finished;
    const second = await pipeline.startRun("user-1");
    await second.finished;

    const firstOutcomes = outcomes(await evaluationsOf(repo, first.runId));
    expect(firstOutcomes["1"]).toBe("skipped: stretch");
    expect(firstOutcomes["2"]).toMatch(/^blocked: Mandatory onsite .*San Francisco, CA/);
    // The second Run looks visibly different: both were seen, nothing is re-judged.
    expect(outcomes(await evaluationsOf(repo, second.runId))).toEqual({
      "1": "skipped: seen",
      "2": "skipped: seen",
    });
    expect(judged).toEqual(["1"]);
    const run = await repo.getRun(second.runId);
    expect(run?.funnel).toMatchObject({
      discovered: 2,
      evaluated: 0,
      skipped: 2,
      blocked: 0,
    });
  });

  it("does not mark a Posting seen when it failed, so a later Run tries again", async () => {
    const repo = new InMemoryRepo();
    let calls = 0;
    const flaky: JobEvaluator = {
      evaluate: async () => {
        calls++;
        if (calls === 1) throw new Error("evaluator unavailable");
        return { scoredBy: "fallback", judgements: [] };
      },
    };
    const discovery: Discovery = { discover: async () => [aPosting("1")] };
    const pipeline = buildPipeline(deps({ repo, evaluator: flaky, discovery }));

    const first = await pipeline.startRun("user-1");
    await first.finished;
    const second = await pipeline.startRun("user-1");
    await second.finished;

    expect(outcomes(await evaluationsOf(repo, first.runId))).toEqual({
      "1": "failed: evaluator unavailable",
    });
    const firstRun = await repo.getRun(first.runId);
    expect(firstRun?.status).toBe("completed");
    expect(firstRun?.funnel.failed).toBe(1);
    expect(outcomes(await evaluationsOf(repo, second.runId))).toEqual({
      "1": "skipped: stretch",
    });
  });
});

describe("screening before evaluation (D7)", () => {
  it("blocks or skips in code with a reason, and never asks the evaluator", async () => {
    const repo = new InMemoryRepo();
    const { evaluator, judged } = recordingEvaluator();
    const discovery: Discovery = {
      discover: async () => [
        { ...aPosting("abroad"), ...onsiteAbroad },
        { ...aPosting("bank"), company: "Barclays" },
        { ...aPosting("intern"), title: "Software Engineer Intern" },
        {
          ...aPosting("fit"),
          title: "Engineering Manager",
          location: "Bengaluru, India",
        },
      ],
    };
    const pipeline = buildPipeline(deps({ repo, evaluator, discovery }));

    const { runId, finished } = await pipeline.startRun("user-1");
    await finished;

    const byJob = outcomes(await evaluationsOf(repo, runId));
    expect(byJob.abroad).toMatch(/^blocked: .*San Francisco, CA/);
    expect(byJob.bank).toMatch(/^blocked: .*Barclays/);
    expect(byJob.intern).toBe("skipped: Title out of target: intern");
    expect(byJob.fit).toBe("skipped: stretch");
    expect(judged).toEqual(["fit"]);
    expect((await repo.getRun(runId))?.funnel).toMatchObject({
      discovered: 4,
      evaluated: 1,
      blocked: 2,
      skipped: 2,
    });
  });

  it("applies the salary floor from the injected screening options", async () => {
    const repo = new InMemoryRepo();
    const lowPay = {
      ...aPosting("1"),
      descriptionText: "Compensation: ₹20-30 LPA",
    };
    const pipeline = buildPipeline(
      deps({
        repo,
        screening: { salaryFloorLpa: 40 },
        discovery: { discover: async () => [lowPay] },
      }),
    );

    const { runId, finished } = await pipeline.startRun("user-1");
    await finished;

    expect(outcomes(await evaluationsOf(repo, runId))["1"]).toMatch(/^blocked: .*30 LPA/);
  });
});

describe("limits (D17)", () => {
  it(`keeps at most ${MAX_IN_FLIGHT} Postings in flight and persists only what it has pulled`, async () => {
    const gated = gatedDelay();
    const repo = new InMemoryRepo();
    // The first delay (before discovery) passes; every per-Posting delay waits.
    let delays = 0;
    const delay = () => (++delays === 1 ? Promise.resolve() : gated.delay());
    const discovery: Discovery = { discover: async () => postings(7) };
    const pipeline = buildPipeline(deps({ repo, discovery, delay }));

    const { runId, finished } = await pipeline.startRun("user-1");
    await vi.waitFor(async () => {
      const statuses = (await evaluationsOf(repo, runId)).map((e) => e.status);
      expect(statuses).toEqual(["evaluating", "evaluating", "evaluating"]);
    });

    gated.open();
    await finished;
    const all = await evaluationsOf(repo, runId);
    expect(all).toHaveLength(7);
    expect(all.every((e) => e.status === "skipped")).toBe(true);
  });

  it("never has more evaluator calls in flight than the cap", async () => {
    let inFlight = 0;
    let peak = 0;
    const evaluator: JobEvaluator = {
      evaluate: async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 1));
        inFlight--;
        return { scoredBy: "fallback", judgements: [] };
      },
    };
    const discovery: Discovery = { discover: async () => postings(10) };
    const pipeline = buildPipeline(deps({ evaluator, discovery }));

    const { finished } = await pipeline.startRun("user-1");
    await finished;

    expect(peak).toBe(MAX_IN_FLIGHT);
  });

  it(`stops at ${MAX_AI_EVALS} evaluations; seen and screened Postings take no slot`, async () => {
    const repo = new InMemoryRepo();
    for (const seen of postings(4, {}, "seen-")) await repo.markSeen(jobKey(seen));
    const { evaluator, judged } = recordingEvaluator();
    const discovered = [
      ...postings(4, {}, "seen-"),
      ...postings(5, onsiteAbroad, "blocked-"),
      ...postings(25, {}, "fit-"),
    ];
    const discovery: Discovery = { discover: async () => discovered };
    const pipeline = buildPipeline(deps({ repo, evaluator, discovery }));

    const { runId, finished } = await pipeline.startRun("user-1");
    await finished;

    expect(judged).toHaveLength(MAX_AI_EVALS);
    const all = await evaluationsOf(repo, runId);
    const count = (pattern: RegExp) =>
      all.filter((e) => pattern.test(`${e.status}: ${e.reason ?? ""}`)).length;
    expect(count(/^skipped: seen$/)).toBe(4);
    expect(count(/^blocked: /)).toBe(5);
    expect(count(/^skipped: stretch$/)).toBe(MAX_AI_EVALS);
    // A Posting already pulled when the last slot went is skipped for the
    // limit; nothing after that is pulled, so it is never written.
    const limited = count(/^skipped: limit$/);
    expect(limited).toBeLessThan(MAX_IN_FLIGHT);
    expect(all).toHaveLength(4 + 5 + MAX_AI_EVALS + limited);
    expect(all.length).toBeLessThan(discovered.length);
    const run = await repo.getRun(runId);
    expect(run?.status).toBe("completed");
    expect(run?.funnel).toMatchObject({
      discovered: discovered.length,
      evaluated: MAX_AI_EVALS,
      blocked: 5,
      skipped: 4 + MAX_AI_EVALS + limited,
    });
  });

  it("leaves Postings it did not evaluate unseen, so the next Run evaluates them", async () => {
    const repo = new InMemoryRepo();
    const { evaluator, judged } = recordingEvaluator();
    const discovered = postings(MAX_AI_EVALS + 5);
    const discovery: Discovery = { discover: async () => discovered };
    const pipeline = buildPipeline(deps({ repo, evaluator, discovery }));

    await (
      await pipeline.startRun("user-1")
    ).finished;
    const firstJudged = judged.length;
    await (
      await pipeline.startRun("user-1")
    ).finished;

    expect(firstJudged).toBe(MAX_AI_EVALS);
    expect(judged).toHaveLength(discovered.length);
    expect(new Set(judged).size).toBe(discovered.length);
  });
});
/** An evaluator that says the named criteria are met for the named Posting, quoting them. */
function cannedEvaluator(metByJob: Record<string, string[]>): JobEvaluator {
  return {
    evaluate: async (posting, criteria) => ({
      scoredBy: "ai",
      judgements: criteria.map((c) => {
        const met = (metByJob[posting.jobId] ?? []).includes(c.id);
        return {
          criterionId: c.id,
          met,
          evidence: met ? `quote: ${c.id}` : "",
        };
      }),
    }),
  };
}

const inIndia: Partial<Posting> = {
  location: "Bengaluru, India",
  remote: false,
};

describe("scoring and Verdict (D7, D8)", () => {
  it("scores in code and lets the Verdict drive the outcome", async () => {
    const repo = new InMemoryRepo();
    const discovery: Discovery = {
      discover: async () => [
        // Manager title (+3, judged in code) + primary stack + startup + real-time = 8.
        { ...aPosting("now"), ...inIndia, title: "Engineering Manager" },
        // Manager title + primary stack = 6.
        { ...aPosting("apply"), ...inIndia, title: "Engineering Manager" },
        // No title tier, startup only = 1.
        { ...aPosting("stretch"), ...inIndia, title: "Software Engineer" },
      ],
    };
    const evaluator = cannedEvaluator({
      now: ["stack_primary", "startup", "realtime_data"],
      apply: ["stack_primary"],
      stretch: ["startup"],
    });
    const pipeline = buildPipeline(deps({ repo, discovery, evaluator }));

    const { runId, finished } = await pipeline.startRun("user-1");
    await finished;

    const byJob = new Map((await evaluationsOf(repo, runId)).map((e) => [e.posting.jobId, e]));
    expect(byJob.get("now")).toMatchObject({
      verdict: "APPLY_NOW",
      score: 8,
      status: "held",
      reason: AWAITING_SUBMIT_REASON,
      scoredBy: "ai",
    });
    expect(byJob.get("apply")).toMatchObject({
      verdict: "APPLY",
      score: 6,
      status: "held",
      reason: "below_auto_threshold",
    });
    expect(byJob.get("stretch")).toMatchObject({
      verdict: "STRETCH",
      score: 1,
      status: "skipped",
      reason: "stretch",
    });
    expect((await repo.getRun(runId))?.funnel).toMatchObject({
      evaluated: 3,
      held: 2,
      skipped: 1,
    });
  });

  it("stores every criterion's evidence, the title tier judged in code", async () => {
    const repo = new InMemoryRepo();
    const discovery: Discovery = {
      discover: async () => [{ ...aPosting("1"), ...inIndia, title: "Engineering Manager" }],
    };
    const asked: string[][] = [];
    const evaluator: JobEvaluator = {
      evaluate: async (posting, criteria) => {
        asked.push(criteria.map((c) => c.id));
        return cannedEvaluator({ "1": ["startup"] }).evaluate(posting, criteria);
      },
    };
    const pipeline = buildPipeline(deps({ repo, discovery, evaluator }));

    const { runId, finished } = await pipeline.startRun("user-1");
    await finished;

    const [evaluation] = await evaluationsOf(repo, runId);
    const byId = new Map(evaluation?.evidence.map((e) => [e.criterionId, e]));
    expect(evaluation?.evidence).toHaveLength(theUser.preferences.fitCriteria.length);
    expect(byId.get("title_manager")).toMatchObject({
      judgedBy: "code",
      met: true,
      evidence: "Engineering Manager",
      points: 3,
    });
    expect(byId.get("startup")).toMatchObject({
      judgedBy: "ai",
      met: true,
      evidence: "quote: startup",
      points: 1,
    });
    // The evaluator is asked only for what code does not judge.
    expect(asked[0]).not.toContain("title_manager");
    expect(asked[0]).toContain("startup");
  });

  it("ignores an evaluator's judgement on a criterion code owns", async () => {
    const repo = new InMemoryRepo();
    const discovery: Discovery = {
      discover: async () => [{ ...aPosting("1"), ...inIndia, title: "Software Engineer" }],
    };
    const overreaching: JobEvaluator = {
      evaluate: async () => ({
        scoredBy: "ai",
        judgements: [{ criterionId: "title_manager", met: true, evidence: "trust me" }],
      }),
    };
    const pipeline = buildPipeline(deps({ repo, discovery, evaluator: overreaching }));

    const { runId, finished } = await pipeline.startRun("user-1");
    await finished;

    const [evaluation] = await evaluationsOf(repo, runId);
    expect(evaluation).toMatchObject({ score: 0, verdict: "STRETCH" });
  });

  it("gives a hard-blocked Posting the BLOCKED Verdict", async () => {
    const repo = new InMemoryRepo();
    const discovery: Discovery = {
      discover: async () => [{ ...aPosting("1"), ...onsiteAbroad }],
    };
    const pipeline = buildPipeline(deps({ repo, discovery }));

    const { runId, finished } = await pipeline.startRun("user-1");
    await finished;

    const [evaluation] = await evaluationsOf(repo, runId);
    expect(evaluation).toMatchObject({
      status: "blocked",
      verdict: "BLOCKED",
      score: null,
    });
  });

  it("streams each Verdict live, before the Run finishes", async () => {
    const repo = new InMemoryRepo();
    const discovery: Discovery = {
      discover: async () => [{ ...aPosting("1"), ...inIndia, title: "Engineering Manager" }],
    };
    const evaluator = cannedEvaluator({ "1": ["stack_primary"] });
    // Discovery and the Posting's step pass; the Run's closing step waits.
    const gated = gatedDelay();
    let delays = 0;
    const delay = () => (++delays <= 2 ? Promise.resolve() : gated.delay());
    const pipeline = buildPipeline(deps({ repo, discovery, evaluator, delay }));

    const { runId, finished } = await pipeline.startRun("user-1");
    const scored: string[] = [];
    const unsub = repo.watchEvaluations(
      runId,
      (batch) => {
        for (const { evaluation } of batch) {
          if (evaluation.verdict) scored.push(`${evaluation.status}/${evaluation.verdict}`);
        }
      },
      (error) => {
        throw error;
      },
    );
    const { statuses, unsub: unsubRun } = recordStatuses(repo, runId);
    await vi.waitFor(() => expect(scored).toContain("held/APPLY"));
    expect(statuses).not.toContain("completed");
    gated.open();
    await finished;
    unsub();
    unsubRun();
  });

  it("scores a whole Run with the keyword fallback matcher, labelled fallback (D24)", async () => {
    const repo = new InMemoryRepo();
    const posting: Posting = {
      ...aPosting("1"),
      ...inIndia,
      title: "Engineering Manager",
      descriptionText:
        "Join a fast-growing startup. You will lead a hands-on team building real-time " +
        "pipelines in TypeScript and Node, with LLM features across the product.",
    };
    const pipeline = buildPipeline(
      deps({
        repo,
        discovery: { discover: async () => [posting] },
        evaluator: keywordMatcher,
      }),
    );

    const { runId, finished } = await pipeline.startRun("user-1");
    await finished;

    const [evaluation] = await evaluationsOf(repo, runId);
    // Manager 3 + primary stack 3 + startup + hands-on + real-time + LLM = 10.
    expect(evaluation).toMatchObject({
      verdict: "APPLY_NOW",
      score: 10,
      scoredBy: "fallback",
      status: "held",
    });
    const startup = evaluation?.evidence.find((e) => e.criterionId === "startup");
    expect(startup?.evidence).toContain("fast-growing startup");
  });

  it("records on the Run that it uses fallback scoring when no AI key is configured (D24)", async () => {
    const repo = new InMemoryRepo();
    const pipeline = buildPipeline(
      deps({ repo, evaluator: keywordMatcher, scoringMode: "fallback" }),
    );
    const { runId, finished } = await pipeline.startRun("user-1");
    expect((await repo.getRun(runId))?.scoring).toBe("fallback");
    await finished;
  });

  describe("with the AI evaluator (injected fetch)", () => {
    const posting: Posting = {
      ...aPosting("1"),
      ...inIndia,
      title: "Engineering Manager",
      descriptionText:
        "Join a fast-growing startup. Our stack is TypeScript, Node.js and React, " +
        "and you will lead a hands-on team.",
    };

    async function runWith(steps: unknown[]) {
      const fake = scriptedFetch(steps);
      const chat = createChatClient({
        fetch: fake.fetch,
        baseUrl: "https://ai.example.test",
        model: "deepseek-chat",
        apiKey: "sk-test",
        timeoutMs: 50,
        maxTokens: 700,
      });
      const repo = new InMemoryRepo();
      const pipeline = buildPipeline(
        deps({
          repo,
          discovery: { discover: async () => [posting] },
          evaluator: createAiEvaluator({ chat, fallback: keywordMatcher }),
          scoringMode: "ai",
        }),
      );
      const { runId, finished } = await pipeline.startRun("user-1");
      await finished;
      const [evaluation] = await evaluationsOf(repo, runId);
      return { evaluation, run: await repo.getRun(runId), fake };
    }

    it("scores from the model's quoted evidence, labelled ai", async () => {
      const { evaluation, run } = await runWith([await readAiFixture("deepseek-chat-completion")]);

      expect(run?.scoring).toBe("ai");
      expect(evaluation?.scoredBy).toBe("ai");
      const stack = evaluation?.evidence.find((e) => e.criterionId === "stack_primary");
      expect(stack).toMatchObject({
        met: true,
        evidence: "Our stack is TypeScript, Node.js and React",
      });
      // The fixture says "startup" is not met, though the keyword matcher would say it is.
      expect(evaluation?.evidence.find((e) => e.criterionId === "startup")?.met).toBe(false);
    });

    it("retries once, then falls back to the keyword matcher for that Evaluation", async () => {
      const { evaluation, run, fake } = await runWith([
        completion("not json"),
        completion("still not json"),
      ]);

      expect(fake.calls).toHaveLength(2);
      expect(run?.status).toBe("completed");
      expect(run?.scoring).toBe("ai");
      expect(evaluation?.scoredBy).toBe("fallback");
      expect(evaluation?.evidence.find((e) => e.criterionId === "startup")?.met).toBe(true);
    });
  });
});

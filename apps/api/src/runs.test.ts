/**
 * The HTTP + SSE seam (spec, Testing seam 4): the Express app wired to the
 * in-memory `Repo` and the skeleton pipeline with a gated `delay`, so each test
 * decides when the Run moves. The stream is read over a real socket so headers,
 * event order, heartbeats and disconnects are observed as a browser would.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import request from "supertest";
import {
  activeRunResponseSchema,
  createRunResponseSchema,
  doneEventSchema,
  errorResponseSchema,
  evalEventSchema,
  runEventSchema,
  snapshotEventSchema,
  type EvaluationChange,
  type Posting,
  type Run,
  type SubscriptionErrorHandler,
} from "@auto-apply/shared";
import { createApp } from "./app.js";
import type { Config } from "./config.js";
import { InMemoryRepo } from "./repo/in-memory-repo.js";
import { buildPipeline } from "./pipeline/pipeline.js";
import type { JobSource } from "./pipeline/ports.js";

const testConfig: Config = {
  NODE_ENV: "test",
  PORT: 3001,
  FIRESTORE_NAMESPACE: "test-local",
  REPO: "memory",
  CORS_ORIGIN: "http://localhost:5173",
};

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
  };
}

const twoPostings: JobSource = { discover: async () => [aPosting("1"), aPosting("2")] };

/**
 * Wraps the in-memory repo to count live subscriptions, so a test can see the
 * stream release its listeners on disconnect (landmine: listener leaks).
 */
class CountingRepo extends InMemoryRepo {
  live = 0;
  /**
   * Firestore's Run and Evaluation listeners are independent, so the Run can
   * reach `completed` before the last Evaluation batch arrives. When set, every
   * Evaluation listener delivers its initial batch and then falls silent.
   */
  lagEvaluationDeltas = false;
  /** When set, every Run listener fails before its first callback. */
  failRunListener = false;

  override watchRun(runId: string, cb: (run: Run) => void, onError: SubscriptionErrorHandler) {
    if (this.failRunListener) {
      queueMicrotask(() => onError(new Error("listener failed")));
      return this.counted(() => {});
    }
    return this.counted(super.watchRun(runId, cb, onError));
  }

  override watchEvaluations(
    runId: string,
    cb: (changes: EvaluationChange[]) => void,
    onError: SubscriptionErrorHandler,
  ) {
    let initial = true;
    const lagging = (changes: EvaluationChange[]) => {
      if (initial || !this.lagEvaluationDeltas) cb(changes);
      initial = false;
    };
    return this.counted(super.watchEvaluations(runId, lagging, onError));
  }

  private counted(unsub: () => void) {
    this.live++;
    let done = false;
    return () => {
      if (!done) this.live--;
      done = true;
      unsub();
    };
  }
}

function harness(heartbeatMs = 15_000) {
  let release: () => void = () => {};
  let gate = new Promise<void>((resolve) => (release = resolve));
  const repo = new CountingRepo();
  let n = 0;
  const pipeline = buildPipeline({
    repo,
    jobSource: twoPostings,
    clock: () => new Date(),
    delay: () => gate,
    newRunId: () => `run-${++n}`,
  });
  const app = createApp(testConfig, { repo, kind: "memory", close: async () => {} }, pipeline, {
    heartbeatMs,
  });
  return {
    app,
    repo,
    pipeline,
    /** Lets every paced step of the Run proceed. */
    openGate: () => {
      release();
      gate = Promise.resolve();
    },
  };
}

type Frame = { event: string; data: unknown } | { comment: string };

/** Reads an SSE response frame by frame, as an `EventSource` would. */
async function openStream(app: ReturnType<typeof harness>["app"], runId: string) {
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  servers.push(server);
  const { port } = server.address() as AddressInfo;
  const controller = new AbortController();
  const res = await fetch(`http://127.0.0.1:${port}/api/runs/${runId}/events`, {
    signal: controller.signal,
  });
  const reader = res.body?.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";

  /** The next frame, or `null` once the server has ended the stream. */
  async function next(): Promise<Frame | null> {
    for (;;) {
      const end = buffer.indexOf("\n\n");
      if (end !== -1) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        return parseFrame(block);
      }
      const chunk = await reader?.read();
      if (!chunk || chunk.done) return null;
      buffer += chunk.value;
    }
  }

  async function rest(): Promise<Frame[]> {
    const frames: Frame[] = [];
    for (let frame = await next(); frame; frame = await next()) frames.push(frame);
    return frames;
  }

  return { res, next, rest, close: () => controller.abort() };
}

function parseFrame(block: string): Frame {
  if (block.startsWith(":")) return { comment: block.slice(1).trim() };
  let event = "message";
  let data = "";
  for (const line of block.split("\n")) {
    if (line.startsWith("event: ")) event = line.slice(7);
    if (line.startsWith("data: ")) data += line.slice(6);
  }
  return { event, data: JSON.parse(data) as unknown };
}

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (s) =>
        new Promise<void>((resolve) => {
          s.closeAllConnections();
          s.close(() => resolve());
        }),
    ),
  );
});

describe("POST /api/runs", () => {
  it("creates a Run and returns 202 with its id, before the Run finishes", async () => {
    const { app } = harness();

    const res = await request(app).post("/api/runs");

    expect(res.status).toBe(202);
    const { runId } = createRunResponseSchema.parse(res.body);
    const active = activeRunResponseSchema.parse((await request(app).get("/api/runs/active")).body);
    expect(active.run).toMatchObject({ runId, status: "discovering" });
  });

  it("returns 409 in the shared error shape while a Run is active (D17)", async () => {
    const { app } = harness();
    await request(app).post("/api/runs");

    const res = await request(app).post("/api/runs");

    expect(res.status).toBe(409);
    expect(errorResponseSchema.parse(res.body).error.code).toBe("run_active");
  });
});

describe("GET /api/runs/active", () => {
  it("returns null when no Run is active", async () => {
    const { app } = harness();
    const res = await request(app).get("/api/runs/active");
    expect(res.status).toBe(200);
    expect(activeRunResponseSchema.parse(res.body)).toEqual({ run: null });
  });
});

describe("GET /api/runs/:runId/events", () => {
  it("returns 404 in the shared error shape for an unknown Run", async () => {
    const { app } = harness();
    const res = await request(app).get("/api/runs/nope/events");
    expect(res.status).toBe(404);
    expect(errorResponseSchema.parse(res.body).error.code).toBe("run_not_found");
  });

  it("returns 400 for a malformed run id", async () => {
    const { app } = harness();
    const res = await request(app).get("/api/runs/bad%20id!/events");
    expect(res.status).toBe(400);
    expect(errorResponseSchema.parse(res.body).error.code).toBe("invalid_request");
  });

  it("sets the SSE headers nginx and browsers need", async () => {
    const { app } = harness();
    const { runId } = createRunResponseSchema.parse((await request(app).post("/api/runs")).body);

    const stream = await openStream(app, runId);

    expect(stream.res.headers.get("content-type")).toMatch(/^text\/event-stream/);
    expect(stream.res.headers.get("cache-control")).toBe("no-cache");
    expect(stream.res.headers.get("x-accel-buffering")).toBe("no");
    stream.close();
  });

  it("streams snapshot → run/eval deltas → terminal run → done, then ends", async () => {
    const { app, openGate } = harness();
    const { runId } = createRunResponseSchema.parse((await request(app).post("/api/runs")).body);
    const stream = await openStream(app, runId);

    const first = await stream.next();
    expect(first).toMatchObject({ event: "snapshot" });
    const snapshot = snapshotEventSchema.parse((first as { data: unknown }).data);
    expect(snapshot.run.status).toBe("discovering");
    expect(snapshot.evaluations).toEqual([]);

    openGate();
    const frames = await stream.rest();
    const events = frames.flatMap((f) => ("event" in f ? [f] : []));

    // Deltas carry full documents (ADR-0003): the Run's statuses arrive in order.
    const runStatuses = events
      .filter((e) => e.event === "run")
      .map((e) => runEventSchema.parse(e.data).status)
      .filter((status, i, all) => all[i - 1] !== status);
    expect(runStatuses).toEqual(["discovering", "evaluating", "applying", "completed"]);

    const lastEvalByKey = new Map<string, string>();
    for (const e of events.filter((ev) => ev.event === "eval")) {
      const evaluation = evalEventSchema.parse(e.data);
      lastEvalByKey.set(evaluation.jobKey, evaluation.status);
    }
    expect(Object.fromEntries(lastEvalByKey)).toEqual({
      "greenhouse:acme:1": "skipped",
      "greenhouse:acme:2": "skipped",
    });

    const [penultimate, last] = events.slice(-2);
    expect(penultimate?.event).toBe("run");
    expect(runEventSchema.parse(penultimate?.data).funnel).toMatchObject({
      discovered: 2,
      evaluated: 2,
      skipped: 2,
    });
    expect(last?.event).toBe("done");
    expect(doneEventSchema.parse(last?.data)).toEqual({ runId, status: "completed" });
  });

  it("re-snapshots the full state on every connect, then ends a finished Run with done", async () => {
    const { app, pipeline, openGate } = harness();
    openGate();
    const { runId, finished } = await pipeline.startRun("demo-user");
    await finished;

    const frames = await (await openStream(app, runId)).rest();

    expect(frames.map((f) => ("event" in f ? f.event : "comment"))).toEqual(["snapshot", "done"]);
    const snapshot = snapshotEventSchema.parse((frames[0] as { data: unknown }).data);
    expect(snapshot.run.status).toBe("completed");
    expect(snapshot.run.funnel.discovered).toBe(2);
    expect(snapshot.evaluations.map((e) => e.status)).toEqual(["skipped", "skipped"]);
  });

  it("brings every Evaluation up to date before done, even if its listener lags the Run's", async () => {
    const { app, repo, openGate } = harness();
    repo.lagEvaluationDeltas = true;
    const { runId } = createRunResponseSchema.parse((await request(app).post("/api/runs")).body);
    const stream = await openStream(app, runId);
    expect(await stream.next()).toMatchObject({ event: "snapshot" });

    openGate();
    const events = (await stream.rest()).flatMap((f) => ("event" in f ? [f] : []));

    const lastEvalByKey = new Map<string, string>();
    for (const e of events.filter((ev) => ev.event === "eval")) {
      const evaluation = evalEventSchema.parse(e.data);
      lastEvalByKey.set(evaluation.jobKey, evaluation.status);
    }
    expect(Object.fromEntries(lastEvalByKey)).toEqual({
      "greenhouse:acme:1": "skipped",
      "greenhouse:acme:2": "skipped",
    });
    expect(events.at(-1)?.event).toBe("done");
  });

  it("reports a subscription failure before the snapshot and ends the stream", async () => {
    const { app, repo } = harness();
    const { runId } = createRunResponseSchema.parse((await request(app).post("/api/runs")).body);
    repo.failRunListener = true;

    const frames = await (await openStream(app, runId)).rest();

    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({ event: "error" });
    expect(errorResponseSchema.parse((frames[0] as { data: unknown }).data).error.code).toBe(
      "subscription_error",
    );
    await vi.waitFor(() => expect(repo.live).toBe(0));
  });

  it("sends a heartbeat comment while the Run is quiet", async () => {
    const { app } = harness(10);
    const { runId } = createRunResponseSchema.parse((await request(app).post("/api/runs")).body);
    const stream = await openStream(app, runId);

    expect(await stream.next()).toMatchObject({ event: "snapshot" });
    expect(await stream.next()).toEqual({ comment: "heartbeat" });
    stream.close();
  });

  it("releases its repository listeners when the client disconnects", async () => {
    const { app, repo } = harness();
    const { runId } = createRunResponseSchema.parse((await request(app).post("/api/runs")).body);
    const stream = await openStream(app, runId);
    await stream.next();
    expect(repo.live).toBe(2);

    stream.close();

    await vi.waitFor(() => expect(repo.live).toBe(0));
  });
});

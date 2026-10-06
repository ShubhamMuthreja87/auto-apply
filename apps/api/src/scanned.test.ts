/**
 * The Scanned jobs reads (HTTP seam, ticket 12): `GET /api/runs` and
 * `GET /api/evaluations[?runId=]`, served from stored data through the `Repo`.
 */
import { describe, expect, it } from "vitest";
import request from "supertest";
import {
  emptyFunnel,
  errorResponseSchema,
  evaluationsListResponseSchema,
  jobKey,
  runsListResponseSchema,
  type Evaluation,
  type Posting,
  type Run,
} from "@auto-apply/shared";
import { createApp } from "./app.js";
import { loadConfig, type Config } from "./config.js";
import { authCookie, TEST_AUTH_ENV } from "./auth/test-auth.js";
import { InMemoryRepo } from "./repo/in-memory-repo.js";
import type { Pipeline } from "./pipeline/pipeline.js";
import { DEMO_UID } from "./user.js";

const noPipeline: Pipeline = {
  startRun: () => Promise.reject(new Error("not used by these tests")),
  retrySubmit: () => Promise.reject(new Error("not used by these tests")),
};

const testConfig: Config = loadConfig({
  ...TEST_AUTH_ENV,
  NODE_ENV: "test",
  PORT: "3001",
  FIRESTORE_NAMESPACE: "test-local",
  REPO: "memory",
  CORS_ORIGIN: "http://localhost:5173",
  JOB_SOURCE: "fixtures",
});

function appWith(repo: InMemoryRepo) {
  return createApp(testConfig, { repo, kind: "memory", close: async () => {} }, noPipeline);
}

function aRun(runId: string, createdAt: string, overrides: Partial<Run> = {}): Run {
  return {
    runId,
    uid: DEMO_UID,
    status: "completed",
    funnel: emptyFunnel(),
    reason: null,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

function aPosting(jobId: string): Posting {
  return {
    ats: "greenhouse",
    board: "acme",
    jobId,
    title: `Engineering Manager ${jobId}`,
    company: "Acme",
    location: "Bengaluru, India",
    descriptionText: "Lead a team.",
    applyUrl: `https://boards.greenhouse.io/acme/jobs/${jobId}`,
    remote: false,
    source: "fixture",
  };
}

function anEvaluation(
  runId: string,
  jobId: string,
  overrides: Partial<Evaluation> = {},
): Evaluation {
  const posting = aPosting(jobId);
  return {
    jobKey: jobKey(posting),
    runId,
    posting,
    status: "blocked",
    verdict: "BLOCKED",
    score: null,
    reason: "Location outside India",
    evidence: [],
    scoredBy: null,
    missingFields: [],
    submission: null,
    createdAt: "2026-10-06T12:00:00.000Z",
    updatedAt: "2026-10-06T12:00:00.000Z",
    ...overrides,
  };
}

/** Two finished Runs of the demo user and one of someone else. */
async function seeded(): Promise<InMemoryRepo> {
  const repo = new InMemoryRepo();
  await repo.createRun(aRun("run-old", "2026-10-05T09:00:00.000Z"));
  await repo.createRun(aRun("run-new", "2026-10-06T09:00:00.000Z"));
  await repo.createRun(aRun("run-other", "2026-10-06T10:00:00.000Z", { uid: "someone-else" }));
  await repo.putEvaluation("run-old", anEvaluation("run-old", "1"));
  await repo.putEvaluation(
    "run-new",
    anEvaluation("run-new", "2", {
      status: "held",
      verdict: "APPLY",
      score: 6,
      reason: "below_auto_threshold",
      scoredBy: "fallback",
      evidence: [
        {
          criterionId: "title_em",
          label: "Engineering Manager title",
          weight: 3,
          judgedBy: "code",
          met: true,
          evidence: "Engineering Manager 2",
          points: 3,
        },
      ],
    }),
  );
  await repo.putEvaluation("run-other", anEvaluation("run-other", "9"));
  return repo;
}

describe("GET /api/runs", () => {
  it("lists the user's Runs newest first", async () => {
    const res = await request(appWith(await seeded()))
      .get("/api/runs")
      .set("Cookie", authCookie());

    expect(res.status).toBe(200);
    const { runs } = runsListResponseSchema.parse(res.body);
    expect(runs.map((run) => run.runId)).toEqual(["run-new", "run-old"]);
  });

  it("answers an empty list before the first Run", async () => {
    const res = await request(appWith(new InMemoryRepo()))
      .get("/api/runs")
      .set("Cookie", authCookie());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ runs: [] });
  });
});

describe("GET /api/evaluations", () => {
  it("lists every Run's Evaluations, newest Run first, with verdict, reason, scoredBy and evidence", async () => {
    const res = await request(appWith(await seeded()))
      .get("/api/evaluations")
      .set("Cookie", authCookie());

    expect(res.status).toBe(200);
    const { evaluations } = evaluationsListResponseSchema.parse(res.body);
    expect(evaluations.map((e) => `${e.runId}/${e.posting.jobId}`)).toEqual([
      "run-new/2",
      "run-old/1",
    ]);
    expect(evaluations[0]).toMatchObject({
      verdict: "APPLY",
      score: 6,
      reason: "below_auto_threshold",
      scoredBy: "fallback",
      evidence: [{ criterionId: "title_em", met: true, points: 3 }],
    });
  });

  it("lists one Run's Evaluations when given its id", async () => {
    const res = await request(appWith(await seeded()))
      .get("/api/evaluations?runId=run-old")
      .set("Cookie", authCookie());

    expect(res.status).toBe(200);
    const { evaluations } = evaluationsListResponseSchema.parse(res.body);
    expect(evaluations.map((e) => e.jobKey)).toEqual(["greenhouse:acme:1"]);
  });

  it("answers 404 for another user's Run", async () => {
    const res = await request(appWith(await seeded()))
      .get("/api/evaluations?runId=run-other")
      .set("Cookie", authCookie());

    expect(res.status).toBe(404);
    expect(errorResponseSchema.parse(res.body).error.code).toBe("run_not_found");
  });

  it("answers 400 for a malformed run id", async () => {
    const res = await request(appWith(await seeded()))
      .get("/api/evaluations?runId=..%2Fusers")
      .set("Cookie", authCookie());

    expect(res.status).toBe(400);
    expect(errorResponseSchema.parse(res.body).error.code).toBe("invalid_request");
  });

  it("answers 500 in the shared error shape when a stored Evaluation is invalid", async () => {
    const repo = await seeded();
    await repo.patchEvaluation("run-old", "greenhouse:acme:1", {
      status: "exploded" as Evaluation["status"],
    });

    const res = await request(appWith(repo)).get("/api/evaluations").set("Cookie", authCookie());

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: { code: "internal", message: "Internal server error" } });
  });
});

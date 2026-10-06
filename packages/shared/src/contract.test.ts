import { describe, it, expect } from "vitest";
import {
  runStatusSchema,
  evaluationStatusSchema,
  errorResponseSchema,
  healthResponseSchema,
  MAX_IN_FLIGHT,
  MAX_AI_EVALS,
  LIMITS,
  APPLY_MIN_FIT,
  APPLY_NOW_MIN_FIT,
  FIT_CAP,
  evaluationSchema,
  runSchema,
} from "./index.js";

describe("contract", () => {
  it("defines the run status machine (D16)", () => {
    expect(runStatusSchema.options).toEqual([
      "discovering",
      "evaluating",
      "applying",
      "completed",
      "failed",
    ]);
    expect(() => runStatusSchema.parse("completed")).not.toThrow();
    expect(() => runStatusSchema.parse("nope")).toThrow();
  });

  it("defines the evaluation status machine (D16)", () => {
    expect(evaluationStatusSchema.options).toContain("submitted");
    expect(evaluationStatusSchema.options).toContain("held");
    expect(() => evaluationStatusSchema.parse("queued")).not.toThrow();
  });

  it("pins the pipeline limits (D17)", () => {
    expect(MAX_IN_FLIGHT).toBe(3);
    expect(MAX_AI_EVALS).toBe(15);
    expect(LIMITS).toEqual({ maxInFlight: 3, maxAiEvals: 15 });
  });

  it("validates the shared error shape", () => {
    expect(() => errorResponseSchema.parse({ error: { code: "x", message: "y" } })).not.toThrow();
    expect(() => errorResponseSchema.parse({ error: { code: "x" } })).toThrow();
  });

  it("validates the health payload", () => {
    const ok = {
      status: "ok",
      service: "auto-apply-api",
      namespace: "dev",
      repo: "firestore",
      time: "t",
    };
    expect(() => healthResponseSchema.parse(ok)).not.toThrow();
    expect(() => healthResponseSchema.parse({ ...ok, status: "down" })).toThrow();
    expect(() => healthResponseSchema.parse({ ...ok, repo: "postgres" })).toThrow();
    const { repo: _repo, ...withoutRepo } = ok;
    expect(() => healthResponseSchema.parse(withoutRepo)).toThrow();
  });

  it("pins the fit scale and Verdict bands from the job-search prompt (D8)", () => {
    expect(FIT_CAP).toBe(10);
    expect(APPLY_NOW_MIN_FIT).toBe(7);
    expect(APPLY_MIN_FIT).toBe(5);
  });

  it("reads an Evaluation stored before scoring existed with no evidence and no scorer", () => {
    const stored = {
      jobKey: "greenhouse:acme:1",
      runId: "run-1",
      posting: {
        ats: "greenhouse",
        board: "acme",
        jobId: "1",
        title: "Engineer",
        company: "Acme",
        location: "Remote",
        descriptionText: "",
        applyUrl: "https://boards.greenhouse.io/acme/jobs/1",
      },
      status: "skipped",
      verdict: null,
      score: null,
      reason: "seen",
      createdAt: "t",
      updatedAt: "t",
    };
    expect(evaluationSchema.parse(stored)).toMatchObject({
      evidence: [],
      scoredBy: null,
      missingFields: [],
    });
  });

  it("reads a Run with or without its scoring mode, and only ai or fallback (D24)", () => {
    const stored = {
      runId: "run-1",
      uid: "u",
      status: "completed",
      funnel: {
        discovered: 0,
        evaluated: 0,
        blocked: 0,
        skipped: 0,
        held: 0,
        submitted: 0,
        failed: 0,
      },
      reason: null,
      createdAt: "t",
      updatedAt: "t",
    };
    expect(runSchema.parse(stored).scoring).toBeUndefined();
    expect(runSchema.parse({ ...stored, scoring: "fallback" }).scoring).toBe("fallback");
    expect(() => runSchema.parse({ ...stored, scoring: "guess" })).toThrow();
  });
});

import { describe, it, expect } from "vitest";
import {
  runStatusSchema,
  evaluationStatusSchema,
  errorResponseSchema,
  healthResponseSchema,
  MAX_IN_FLIGHT,
  MAX_AI_EVALS,
  LIMITS,
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
    const ok = { status: "ok", service: "auto-apply-api", namespace: "dev", time: "t" };
    expect(() => healthResponseSchema.parse(ok)).not.toThrow();
    expect(() => healthResponseSchema.parse({ ...ok, status: "down" })).toThrow();
  });
});

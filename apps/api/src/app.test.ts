import { describe, it, expect } from "vitest";
import request from "supertest";
import { healthResponseSchema } from "@auto-apply/shared";
import { createApp } from "./app.js";
import type { Config } from "./config.js";
import { InMemoryRepo } from "./repo/in-memory-repo.js";
import type { Pipeline } from "./pipeline/pipeline.js";

const noPipeline: Pipeline = {
  startRun: () => Promise.reject(new Error("not used by these tests")),
};

const testConfig: Config = {
  NODE_ENV: "test",
  PORT: 3001,
  FIRESTORE_NAMESPACE: "test-local",
  REPO: "memory",
  CORS_ORIGIN: "http://localhost:5173",
};

describe("API", () => {
  const app = createApp(testConfig, {
    repo: new InMemoryRepo(),
    kind: "memory",
    close: async () => {},
  }, noPipeline);

  it("GET /api/health returns a contract-valid payload", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    const parsed = healthResponseSchema.parse(res.body);
    expect(parsed.status).toBe("ok");
    expect(parsed.service).toBe("auto-apply-api");
    expect(parsed.namespace).toBe("test-local");
    // ADR-0004: health says which repository is active.
    expect(parsed.repo).toBe("memory");
  });

  it("allows exactly the configured origin, with credentials, never * (D27)", async () => {
    const res = await request(app).get("/api/health").set("Origin", "http://localhost:5173");
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("returns the shared JSON error shape for unknown routes", async () => {
    const res = await request(app).get("/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: "not_found", message: "Not found" } });
  });
});

import { describe, it, expect } from "vitest";
import request from "supertest";
import { healthResponseSchema } from "@auto-apply/shared";
import { createApp } from "./app.js";
import type { Config } from "./config.js";
import { InMemoryRepo } from "./repo/in-memory-repo.js";

const testConfig: Config = {
  NODE_ENV: "test",
  PORT: 3001,
  FIRESTORE_NAMESPACE: "test-local",
  REPO: "memory",
};

describe("API", () => {
  const app = createApp(testConfig, {
    repo: new InMemoryRepo(),
    kind: "memory",
    close: async () => {},
  });

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

  it("returns the shared JSON error shape for unknown routes", async () => {
    const res = await request(app).get("/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: "not_found", message: "Not found" } });
  });
});

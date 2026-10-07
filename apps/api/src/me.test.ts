/**
 * `GET /api/me` (HTTP seam, ticket 04): the seeded user document, validated on
 * read and returned in the contract's shape.
 */
import { describe, expect, it } from "vitest";
import request from "supertest";
import { errorResponseSchema, meResponseSchema } from "@auto-apply/shared";
import { createApp } from "./app.js";
import { loadConfig, type Config } from "./config.js";
import { authCookie, TEST_AUTH_ENV } from "./auth/test-auth.js";
import { InMemoryRepo } from "./repo/in-memory-repo.js";
import type { Pipeline } from "./pipeline/pipeline.js";
import { DEMO_UID, seedUser } from "./user.js";

const noPipeline: Pipeline = {
  startRun: () => Promise.reject(new Error("not used by these tests")),
  retrySubmit: () => Promise.reject(new Error("not used by these tests")),
  submitAnswers: () => Promise.reject(new Error("not used by these tests")),
};

const testConfig: Config = loadConfig({
  ...TEST_AUTH_ENV,
  NODE_ENV: "test",
  FIRESTORE_NAMESPACE: "test-local",
  REPO: "memory",
  CORS_ORIGIN: "http://localhost:5173",
  JOB_SOURCE: "fixtures",
});

function appWith(repo: InMemoryRepo) {
  return createApp(testConfig, { repo, kind: "memory", close: async () => {} }, noPipeline);
}

describe("GET /api/me", () => {
  it("returns the seeded user document after first boot", async () => {
    const repo = new InMemoryRepo();
    await seedUser(repo, DEMO_UID);

    const res = await request(appWith(repo)).get("/api/me").set("Cookie", authCookie());

    expect(res.status).toBe(200);
    const me = meResponseSchema.parse(res.body);
    expect(me.uid).toBe(DEMO_UID);
    expect(me.profile.fullName).toBe("Shubham Muthreja");
    expect(me.preferences.region).toBe("India");
    expect(me.settings.location.requiresVisaSponsorship).toBe(false);
  });

  it("answers 404 in the shared error shape when no user exists", async () => {
    const res = await request(appWith(new InMemoryRepo()))
      .get("/api/me")
      .set("Cookie", authCookie());

    expect(res.status).toBe(404);
    expect(errorResponseSchema.parse(res.body).error.code).toBe("user_not_found");
  });

  it("answers 500 without leaking the document when the stored user is invalid", async () => {
    const repo = new InMemoryRepo();
    await repo.seedUserIfMissing(DEMO_UID, {
      uid: DEMO_UID,
      profile: { fullName: 42 },
      preferences: {},
      settings: {},
    });

    const res = await request(appWith(repo)).get("/api/me").set("Cookie", authCookie());

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: "user_doc_invalid", message: "The stored user document is invalid" },
    });
  });
});

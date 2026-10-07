/**
 * Auth at the HTTP seam (spec, Testing seam 4; D26, D27): login sets a PII-free
 * JWT in a locked-down cookie, `requireAuth` guards every `/api/*` route but
 * login, logout and health (the SSE stream included), login and Run starts
 * are rate-limited, and CORS allows exactly one origin with credentials.
 */
import { describe, expect, it } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { errorResponseSchema, sessionResponseSchema } from "@auto-apply/shared";
import { createApp, type AppOptions } from "./app.js";
import { loadConfig, type Config } from "./config.js";
import { InMemoryRepo } from "./repo/in-memory-repo.js";
import type { Pipeline } from "./pipeline/pipeline.js";
import { DEMO_UID, seedUser } from "./user.js";
import { authCookie, TEST_AUTH_ENV, TEST_PASSWORD, TEST_USERNAME } from "./auth/test-auth.js";

const ORIGIN = "http://localhost:5173";

const testConfig: Config = loadConfig({
  NODE_ENV: "test",
  FIRESTORE_NAMESPACE: "test-local",
  REPO: "memory",
  CORS_ORIGIN: ORIGIN,
  JOB_SOURCE: "fixtures",
  ...TEST_AUTH_ENV,
});

const startsRuns: Pipeline = {
  startRun: async () => ({ runId: crypto.randomUUID(), finished: Promise.resolve() }),
  retrySubmit: () => Promise.reject(new Error("not used by these tests")),
  submitAnswers: () => Promise.reject(new Error("not used by these tests")),
};

async function appWith(options: AppOptions = {}) {
  const repo = new InMemoryRepo();
  await seedUser(repo, DEMO_UID);
  return createApp(
    testConfig,
    { repo, kind: "memory", close: async () => {} },
    startsRuns,
    options,
  );
}

function setCookies(res: request.Response): string[] {
  const header = res.headers["set-cookie"] as string[] | string | undefined;
  if (header === undefined) return [];
  return Array.isArray(header) ? header : [header];
}

function login(app: Awaited<ReturnType<typeof appWith>>, username: string, password: string) {
  return request(app).post("/api/login").send({ username, password });
}

describe("POST /api/login", () => {
  it("sets a PII-free 12-hour JWT in an httpOnly, Secure, SameSite=Strict cookie", async () => {
    const res = await login(await appWith(), TEST_USERNAME, TEST_PASSWORD);

    expect(res.status).toBe(200);
    expect(sessionResponseSchema.parse(res.body)).toEqual({ authenticated: true });

    const [cookie, ...others] = setCookies(res);
    expect(others).toEqual([]);
    expect(cookie).toMatch(/^auth=[^;]+;/);
    expect(cookie).toMatch(/; HttpOnly/);
    expect(cookie).toMatch(/; Secure/);
    expect(cookie).toMatch(/; SameSite=Strict/);
    expect(cookie).toMatch(/; Path=\//);
    expect(cookie).toMatch(/; Max-Age=43200/);

    const token = /^auth=([^;]+);/.exec(cookie ?? "")?.[1] ?? "";
    const payload = jwt.verify(token, TEST_AUTH_ENV.JWT_SECRET);
    expect(payload).toEqual({ sub: DEMO_UID, iat: expect.any(Number), exp: expect.any(Number) });
    if (typeof payload === "string") throw new Error("expected an object payload");
    expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(12 * 60 * 60);
    expect(JSON.stringify(payload)).not.toContain(TEST_USERNAME);
  });

  it.each([
    ["a wrong password", TEST_USERNAME, `${TEST_PASSWORD}x`],
    ["an unknown username", "someone-else", TEST_PASSWORD],
  ])("answers 401 without a cookie for %s", async (_case, username, password) => {
    const res = await login(await appWith(), username, password);

    expect(res.status).toBe(401);
    expect(errorResponseSchema.parse(res.body).error.code).toBe("invalid_credentials");
    expect(setCookies(res)).toEqual([]);
  });

  it("answers 400 for a malformed body", async () => {
    const res = await request(await appWith())
      .post("/api/login")
      .send({ username: TEST_USERNAME });

    expect(res.status).toBe(400);
    expect(errorResponseSchema.parse(res.body).error.code).toBe("invalid_request");
  });

  it("is rate-limited per client, counting only failed attempts", async () => {
    const app = await appWith({ rateLimits: { login: 2 } });

    expect((await login(app, TEST_USERNAME, TEST_PASSWORD)).status).toBe(200);
    expect((await login(app, TEST_USERNAME, "wrong")).status).toBe(401);
    expect((await login(app, TEST_USERNAME, "wrong")).status).toBe(401);
    const limited = await login(app, TEST_USERNAME, TEST_PASSWORD);

    expect(limited.status).toBe(429);
    expect(errorResponseSchema.parse(limited.body).error.code).toBe("rate_limited");
  });
});

describe("requireAuth", () => {
  it.each([
    ["GET", "/api/session"],
    ["GET", "/api/me"],
    ["GET", "/api/runs"],
    ["GET", "/api/runs/active"],
    ["POST", "/api/runs"],
    ["GET", "/api/evaluations"],
    ["GET", "/api/runs/some-run/events"],
    ["POST", "/api/runs/some-run/jobs/greenhouse:acme:1/answers"],
    // Guarded at the router level, so routes added later are covered too.
    ["GET", "/api/not-built-yet"],
    ["PUT", "/api/me"],
  ])("answers %s %s with 401 and no data without a cookie", async (method, path) => {
    const app = await appWith();
    const res = await (method === "POST"
      ? request(app).post(path)
      : method === "PUT"
        ? request(app).put(path)
        : request(app).get(path));

    expect(res.status).toBe(401);
    expect(errorResponseSchema.parse(res.body).error.code).toBe("unauthenticated");
  });

  it("lets the cookie from login through", async () => {
    const app = await appWith();
    const [cookie] = setCookies(await login(app, TEST_USERNAME, TEST_PASSWORD));

    const session = await request(app)
      .get("/api/session")
      .set("Cookie", (cookie ?? "").split(";")[0] ?? "");
    const me = await request(app).get("/api/me").set("Cookie", authCookie());

    expect(session.status).toBe(200);
    expect(sessionResponseSchema.parse(session.body)).toEqual({ authenticated: true });
    expect(me.status).toBe(200);
  });

  it.each([
    ["signed with another secret", jwt.sign({}, "x".repeat(32), { subject: DEMO_UID })],
    [
      "expired",
      jwt.sign({ exp: Math.floor(Date.now() / 1000) - 60 }, TEST_AUTH_ENV.JWT_SECRET, {
        subject: DEMO_UID,
      }),
    ],
    ["unsigned", jwt.sign({ sub: DEMO_UID }, "", { algorithm: "none" })],
    ["garbage", "not-a-jwt"],
  ])("rejects a token %s", async (_case, token) => {
    const res = await request(await appWith())
      .get("/api/me")
      .set("Cookie", `auth=${token}`);

    expect(res.status).toBe(401);
  });

  it("authenticates the SSE stream off the cookie at connect", async () => {
    const app = await appWith();

    const without = await request(app).get("/api/runs/no-such-run/events");
    // Past the guard, the route itself answers: the Run does not exist.
    const withCookie = await request(app)
      .get("/api/runs/no-such-run/events")
      .set("Cookie", authCookie());

    expect(without.status).toBe(401);
    expect(withCookie.status).toBe(404);
  });

  it("leaves the health check public", async () => {
    expect((await request(await appWith()).get("/api/health")).status).toBe(200);
  });
});

describe("POST /api/logout", () => {
  it("clears the cookie with the same attributes", async () => {
    const res = await request(await appWith())
      .post("/api/logout")
      .set("Cookie", authCookie());

    expect(res.status).toBe(204);
    const [cookie] = setCookies(res);
    expect(cookie).toMatch(/^auth=;/);
    expect(cookie).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(cookie).toMatch(/; HttpOnly/);
    expect(cookie).toMatch(/; Secure/);
    expect(cookie).toMatch(/; SameSite=Strict/);
  });
});

describe("POST /api/runs rate limit", () => {
  it("answers 429 once the per-client budget is spent", async () => {
    const app = await appWith({ rateLimits: { runs: 1 } });

    const first = await request(app).post("/api/runs").set("Cookie", authCookie());
    const second = await request(app).post("/api/runs").set("Cookie", authCookie());

    expect(first.status).toBe(202);
    expect(second.status).toBe(429);
    expect(errorResponseSchema.parse(second.body).error.code).toBe("rate_limited");
  });
});

describe("CORS (D27)", () => {
  it("allows exactly the configured origin, with credentials", async () => {
    const res = await request(await appWith())
      .options("/api/runs")
      .set("Origin", ORIGIN)
      .set("Access-Control-Request-Method", "POST");

    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(ORIGIN);
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("does not allow any other origin", async () => {
    const res = await request(await appWith())
      .get("/api/health")
      .set("Origin", "https://evil.example.com");

    expect(res.headers["access-control-allow-origin"]).not.toBe("https://evil.example.com");
    expect(res.headers["access-control-allow-origin"]).not.toBe("*");
  });
});

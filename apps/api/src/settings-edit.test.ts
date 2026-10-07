/**
 * `PUT /api/me` (HTTP seam, ticket 17): edits are validated with the contract,
 * persisted through the `Repo`, never re-seed, never store compensation — and
 * the next Run and form fill read them.
 */
import { describe, expect, it } from "vitest";
import request from "supertest";
import {
  errorResponseSchema,
  meResponseSchema,
  SALARY_FLOOR_RULE_ID,
  updateMeResponseSchema,
  type Evaluation,
  type Posting,
  type UpdateMeRequest,
  type User,
} from "@auto-apply/shared";
import { createApp } from "./app.js";
import { loadConfig, type Config } from "./config.js";
import { InMemoryRepo } from "./repo/in-memory-repo.js";
import { buildPipeline, type Pipeline } from "./pipeline/pipeline.js";
import { keywordMatcher } from "./evaluation/keyword-matcher.js";
import { greenhouseForms } from "./forms/greenhouse-forms.js";
import { simulatedSubmitter } from "./submit/simulated-submitter.js";
import { authCookie, TEST_AUTH_ENV } from "./auth/test-auth.js";
import { resolveFields } from "./forms/resolve.js";
import type { FormField } from "./pipeline/ports.js";
import { SEED_USER } from "./seed-user.js";
import { DEMO_UID, loadUser, seedUser } from "./user.js";

const noPipeline: Pipeline = {
  startRun: () => Promise.reject(new Error("not used by this test")),
  retrySubmit: () => Promise.reject(new Error("not used by this test")),
};

const testConfig: Config = loadConfig({
  ...TEST_AUTH_ENV,
  NODE_ENV: "test",
  FIRESTORE_NAMESPACE: "test-local",
  REPO: "memory",
  CORS_ORIGIN: "http://localhost:5173",
  JOB_SOURCE: "fixtures",
});

function appWith(repo: InMemoryRepo, pipeline: Pipeline = noPipeline) {
  return createApp(testConfig, { repo, kind: "memory", close: async () => {} }, pipeline);
}

async function seeded() {
  const repo = new InMemoryRepo();
  await seedUser(repo, DEMO_UID);
  return repo;
}

/** The seed as an edit request, changed by `edit`. */
function edits(edit: (body: UpdateMeRequest) => void = () => {}): UpdateMeRequest {
  const { alwaysUserOnly: _kept, ...settings } = structuredClone(SEED_USER.settings);
  const body: UpdateMeRequest = {
    profile: structuredClone(SEED_USER.profile),
    preferences: structuredClone(SEED_USER.preferences),
    settings,
  };
  edit(body);
  return body;
}

describe("PUT /api/me", () => {
  it("validates, saves and returns the edited user document", async () => {
    const repo = await seeded();

    const res = await request(appWith(repo))
      .put("/api/me")
      .set("Cookie", authCookie())
      .send(
        edits((body) => {
          body.profile.headline = "Staff Engineer";
          body.preferences.excludedTitles.terms.push("Architect");
          body.settings.availability.noticePeriodDays = 60;
        }),
      );

    expect(res.status).toBe(200);
    const saved = updateMeResponseSchema.parse(res.body);
    expect(saved.uid).toBe(DEMO_UID);
    expect(saved.profile.headline).toBe("Staff Engineer");
    expect(saved.preferences.excludedTitles.terms).toContain("Architect");
    expect(saved.settings.availability.noticePeriodDays).toBe(60);

    const me = meResponseSchema.parse(
      (await request(appWith(repo)).get("/api/me").set("Cookie", authCookie())).body,
    );
    expect(me).toEqual(saved);
  });

  it("saves the preferences preset, leaving the stored preferences as they are", async () => {
    const repo = await seeded();
    const me = async () =>
      meResponseSchema.parse(
        (await request(appWith(repo)).get("/api/me").set("Cookie", authCookie())).body,
      );
    expect((await me()).settings.preferencesPreset).toBe("default");

    const res = await request(appWith(repo))
      .put("/api/me")
      .set("Cookie", authCookie())
      .send(edits((body) => void (body.settings.preferencesPreset = "demo")));

    expect(res.status).toBe(200);
    const stored = await me();
    expect(stored.settings.preferencesPreset).toBe("demo");
    expect(stored.preferences).toEqual(SEED_USER.preferences);
  });

  it("reads a user document stored before presets as the default preset", async () => {
    const repo = new InMemoryRepo();
    const { preferencesPreset: _new, ...olderSettings } = SEED_USER.settings;
    await repo.seedUserIfMissing(DEMO_UID, {
      uid: DEMO_UID,
      profile: SEED_USER.profile,
      preferences: SEED_USER.preferences,
      settings: olderSettings,
    });

    const res = await request(appWith(repo)).get("/api/me").set("Cookie", authCookie());

    expect(res.status).toBe(200);
    expect(meResponseSchema.parse(res.body).settings.preferencesPreset).toBe("default");
  });

  it("answers 401 without a session and stores nothing (D26)", async () => {
    const repo = await seeded();

    const res = await request(appWith(repo))
      .put("/api/me")
      .send(edits((body) => void (body.profile.headline = "Intruder")));

    expect(res.status).toBe(401);
    expect(await loadUser(repo, DEMO_UID)).toEqual({ uid: DEMO_UID, ...SEED_USER });
  });

  it("survives the next boot's seed: an edit is never overwritten (D13)", async () => {
    const repo = await seeded();
    await request(appWith(repo))
      .put("/api/me")
      .set("Cookie", authCookie())
      .send(edits((body) => void (body.profile.headline = "Edited")));

    await seedUser(repo, DEMO_UID);

    expect((await loadUser(repo, DEMO_UID)).profile.headline).toBe("Edited");
  });

  it("answers 404 and creates nothing when no user document exists", async () => {
    const repo = new InMemoryRepo();

    const res = await request(appWith(repo))
      .put("/api/me")
      .set("Cookie", authCookie())
      .send(edits());

    expect(res.status).toBe(404);
    expect(errorResponseSchema.parse(res.body).error.code).toBe("user_not_found");
    expect(await repo.getUser(DEMO_UID)).toBeNull();
  });

  it.each<[string, (body: UpdateMeRequest) => unknown, string]>([
    [
      "a wrong type",
      (body) =>
        ((body.settings.availability as { noticePeriodDays: unknown }).noticePeriodDays = "soon"),
      "settings.availability.noticePeriodDays",
    ],
    [
      "a missing section",
      (body) => delete (body as Partial<UpdateMeRequest>).preferences,
      "preferences",
    ],
    [
      "APPLY starting above APPLY NOW",
      (body) => (body.preferences.verdictBands.applyMinFit = 8),
      "preferences.verdictBands.applyMinFit",
    ],
    [
      "APPLY NOW above the fit cap",
      (body) => (body.preferences.verdictBands.applyNowMinFit = 11),
      "preferences.verdictBands.applyNowMinFit",
    ],
  ])("rejects %s with 400 naming the field, and stores nothing", async (_case, edit, path) => {
    const repo = await seeded();

    const res = await request(appWith(repo))
      .put("/api/me")
      .set("Cookie", authCookie())
      .send(edits(edit));

    expect(res.status).toBe(400);
    const { error } = errorResponseSchema.parse(res.body);
    expect(error.code).toBe("invalid_request");
    expect(error.message).toContain(path);
    expect(await loadUser(repo, DEMO_UID)).toEqual({ uid: DEMO_UID, ...SEED_USER });
  });

  it("never echoes a submitted value in a validation error", async () => {
    const repo = await seeded();
    const res = await request(appWith(repo))
      .put("/api/me")
      .set("Cookie", authCookie())
      .send(
        edits((body) => {
          (body.profile as { email: unknown }).email = { secret: "top-secret-value" };
        }),
      );

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toContain("top-secret-value");
  });

  it("never stores compensation: unknown keys are dropped, the salary floor stays null", async () => {
    const repo = await seeded();
    const withSalary = edits() as UpdateMeRequest & { settings: Record<string, unknown> };
    withSalary.settings.compensation = { expectedLpa: 60 };

    const ok = await request(appWith(repo))
      .put("/api/me")
      .set("Cookie", authCookie())
      .send(withSalary);
    expect(ok.status).toBe(200);
    expect(JSON.stringify(await repo.getUser(DEMO_UID))).not.toMatch(/expectedLpa|60 LPA/);

    const floor = await request(appWith(repo))
      .put("/api/me")
      .set("Cookie", authCookie())
      .send(
        edits((body) => {
          const rule = body.preferences.hardBlocks.find((r) => r.id === SALARY_FLOOR_RULE_ID);
          if (rule) rule.threshold = 40;
        }),
      );
    expect(floor.status).toBe(400);
    expect(errorResponseSchema.parse(floor.body).error.message).toMatch(/salary floor/i);
  });

  it("keeps the always-user-only categories (D10) whatever the body says", async () => {
    const repo = await seeded();
    const body = edits() as UpdateMeRequest & { settings: Record<string, unknown> };
    body.settings.alwaysUserOnly = [];

    await request(appWith(repo)).put("/api/me").set("Cookie", authCookie()).send(body);

    expect((await loadUser(repo, DEMO_UID)).settings.alwaysUserOnly).toEqual(
      SEED_USER.settings.alwaysUserOnly,
    );
  });
});

describe("edits drive the next Run and form fill", () => {
  const acmeManager: Posting = {
    ats: "greenhouse",
    board: "acme",
    jobId: "1",
    title: "Engineering Manager",
    company: "Acme Robotics",
    location: "Bengaluru, India",
    descriptionText: "Lead a product engineering team.",
    applyUrl: "https://boards.greenhouse.io/acme/jobs/1",
    remote: false,
    source: "live",
  };

  function pipelineOver(repo: InMemoryRepo, posting: Posting = acmeManager) {
    let n = 0;
    return buildPipeline({
      repo,
      discovery: { discover: async () => [{ ...posting, jobId: String(++n) }] },
      evaluator: keywordMatcher,
      forms: greenhouseForms({ fetch, timeoutMs: 1_000, mode: "fixtures" }),
      submitter: simulatedSubmitter({ clock: () => new Date(), delay: async () => {} }),
      clock: () => new Date(),
      delay: async () => {},
      newRunId: () => `run-${n}`,
      // The composition root's loader: every Run reads the stored document.
      loadUser: (uid) => loadUser(repo, uid),
    });
  }

  async function runOnce(repo: InMemoryRepo, pipeline: Pipeline): Promise<Evaluation> {
    const { runId, finished } = await pipeline.startRun(DEMO_UID);
    await finished;
    const [evaluation] = await repo.listEvaluations(runId);
    if (!evaluation) throw new Error("no evaluation");
    return evaluation;
  }

  it("a company added to a blocked category blocks it in the next Run (D7)", async () => {
    const repo = await seeded();
    const pipeline = pipelineOver(repo);

    const before = await runOnce(repo, pipeline);
    expect(before.status).not.toBe("blocked");

    const res = await request(appWith(repo, pipeline))
      .put("/api/me")
      .set("Cookie", authCookie())
      .send(
        edits((body) => {
          body.preferences.companyBlocks.categories[0]?.companies.push("Acme Robotics");
        }),
      );
    expect(res.status).toBe(200);

    const after = await runOnce(repo, pipeline);
    expect(after.status).toBe("blocked");
    expect(after.reason).toMatch(/Acme Robotics/);
  });

  it("the demo preset turns the location block off for the next Run, and labels it", async () => {
    const repo = await seeded();
    const onsiteAbroad = { ...acmeManager, location: "San Francisco, CA" };
    const pipeline = pipelineOver(repo, onsiteAbroad);

    const before = await runOnce(repo, pipeline);
    expect(before.status).toBe("blocked");
    expect(before.reason).toMatch(/San Francisco/);

    const res = await request(appWith(repo, pipeline))
      .put("/api/me")
      .set("Cookie", authCookie())
      .send(edits((body) => void (body.settings.preferencesPreset = "demo")));
    expect(res.status).toBe(200);

    const after = await runOnce(repo, pipeline);
    expect(after.status).not.toBe("blocked");
    expect(after.verdict).not.toBeNull();
    expect((await repo.getRun(after.runId))?.preferencesPreset).toBe("demo");
  });

  it("an edited fit criterion weight changes the next Run's score (D6, ticket 17)", async () => {
    const repo = await seeded();
    const pipeline = pipelineOver(repo);

    const before = await runOnce(repo, pipeline);
    expect(before.evidence.find((e) => e.criterionId === "title_manager")?.points).toBe(3);

    const res = await request(appWith(repo, pipeline))
      .put("/api/me")
      .set("Cookie", authCookie())
      .send(
        edits((body) => {
          const manager = body.preferences.fitCriteria.find((c) => c.id === "title_manager");
          if (manager) manager.weight = 1;
        }),
      );
    expect(res.status).toBe(200);

    const after = await runOnce(repo, pipeline);
    expect(after.evidence.find((e) => e.criterionId === "title_manager")?.points).toBe(1);
    expect(after.score).toBe((before.score ?? 0) - 2);
  });

  it("a removed fit criterion no longer scores in the next Run (D6, ticket 17)", async () => {
    const repo = await seeded();
    const pipeline = pipelineOver(repo);
    const before = await runOnce(repo, pipeline);

    await request(appWith(repo, pipeline))
      .put("/api/me")
      .set("Cookie", authCookie())
      .send(
        edits((body) => {
          body.preferences.fitCriteria = body.preferences.fitCriteria.filter(
            (c) => c.id !== "title_manager",
          );
        }),
      );

    const after = await runOnce(repo, pipeline);
    expect(after.evidence.map((e) => e.criterionId)).not.toContain("title_manager");
    expect(after.score).toBe((before.score ?? 0) - 3);
  });

  it("the language gate caps the next Run's Verdict, and a Settings edit to it takes effect", async () => {
    const repo = await seeded();
    let n = 0;
    const pythonLead = {
      ...acmeManager,
      title: "Lead Python Engineer",
      descriptionText:
        "Hands-on role at a startup building real-time IoT with React and TypeScript, shipping LLM features.",
    };
    const pipeline = buildPipeline({
      repo,
      discovery: { discover: async () => [{ ...pythonLead, jobId: String(++n) }] },
      evaluator: keywordMatcher,
      forms: greenhouseForms({ fetch, timeoutMs: 1_000, mode: "fixtures" }),
      submitter: simulatedSubmitter({ clock: () => new Date(), delay: async () => {} }),
      clock: () => new Date(),
      delay: async () => {},
      newRunId: () => `run-${n}`,
      loadUser: (uid) => loadUser(repo, uid),
    });

    const before = await runOnce(repo, pipeline);
    expect(before.score).toBeGreaterThanOrEqual(7);
    expect(before.verdict).toBe("APPLY");
    expect(before.evidence.find((e) => e.criterionId === "gate:python_primary_ic")).toMatchObject({
      met: true,
      evidence: "Lead Python Engineer",
    });

    const res = await request(appWith(repo, pipeline))
      .put("/api/me")
      .set("Cookie", authCookie())
      .send(
        edits((body) => {
          const python = body.preferences.languageGate.find((r) => r.id === "python_primary_ic");
          if (python) python.cap = "STRETCH";
        }),
      );
    expect(res.status).toBe(200);

    const after = await runOnce(repo, pipeline);
    expect(after.verdict).toBe("STRETCH");
    expect(after.status).toBe("skipped");
  });

  it("edited profile and settings change how form fields resolve (D9)", async () => {
    const repo = await seeded();
    await request(appWith(repo))
      .put("/api/me")
      .set("Cookie", authCookie())
      .send(
        edits((body) => {
          body.profile.email = "new@example.com";
          body.settings.availability.noticePeriodDays = 90;
        }),
      );

    const field = (id: string, label: string): FormField => ({
      id,
      label,
      description: "",
      type: "text",
      required: true,
      group: "questions",
    });
    const user: User = await loadUser(repo, DEMO_UID);
    const [email, notice] = resolveFields(
      [field("email", "Email"), field("question_1", "What is your notice period?")],
      user,
    );
    expect(email?.value).toBe("new@example.com");
    expect(notice?.value).toBe("90 days");
  });
});

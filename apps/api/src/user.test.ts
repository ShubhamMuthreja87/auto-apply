/**
 * The user document seam (ticket 04): seed on first boot, load and validate on
 * read, through the `Repo` port only. The seed is checked against its own
 * sources so no fact in it is invented.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { userDocSchema } from "@auto-apply/shared";
import { InMemoryRepo } from "./repo/in-memory-repo.js";
import { SEED_USER } from "./seed-user.js";
import { DEMO_UID, loadUser, seedUser, UserDocInvalidError, UserNotFoundError } from "./user.js";

const sourceDir = path.resolve(import.meta.dirname, "../../../seed/source");
const source = (name: string) => readFileSync(path.join(sourceDir, name), "utf8");
const jobSearchPrompt = source("job-search-prompt.md");
const resume = source("resume.md");
const settingsSource = source("application-settings.md");

/** Every string value anywhere in `value`, with the key path that holds it. */
function allKeys(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => allKeys(v, `${prefix}[${i}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => [
      `${prefix}.${k}`,
      ...allKeys(v, `${prefix}.${k}`),
    ]);
  }
  return [];
}

describe("seedUser + loadUser", () => {
  it("seeds a fresh store on first boot and loads the validated user", async () => {
    const repo = new InMemoryRepo();
    expect(await repo.getUser(DEMO_UID)).toBeNull();

    await seedUser(repo, DEMO_UID);
    const user = await loadUser(repo, DEMO_UID);

    expect(user.uid).toBe(DEMO_UID);
    expect(user.profile.fullName).toBe("Shubham Muthreja");
    expect(user.settings.availability.noticePeriodDays).toBe(30);
    expect(user.preferences.fitCriteria.length).toBeGreaterThan(0);
  });

  it("never re-seeds over an edited document", async () => {
    // A store that already holds an edited document, as after a Settings save.
    const repo = new InMemoryRepo();
    const edited = structuredClone(SEED_USER);
    edited.settings.availability.noticePeriodDays = 60;
    await repo.seedUserIfMissing(DEMO_UID, { ...edited, uid: DEMO_UID });

    // The next boot seeds again; the edit survives.
    await seedUser(repo, DEMO_UID);

    const user = await loadUser(repo, DEMO_UID);
    expect(user.settings.availability.noticePeriodDays).toBe(60);
  });

  it("rejects a stored document whose preferences fail validation", async () => {
    const repo = new InMemoryRepo();
    await repo.seedUserIfMissing(DEMO_UID, {
      uid: DEMO_UID,
      profile: SEED_USER.profile,
      preferences: { fitCriteria: "not a list" },
      settings: SEED_USER.settings,
    });
    await expect(loadUser(repo, DEMO_UID)).rejects.toBeInstanceOf(UserDocInvalidError);
  });

  it("rejects a stored document whose settings fail validation", async () => {
    const repo = new InMemoryRepo();
    await repo.seedUserIfMissing(DEMO_UID, {
      uid: DEMO_UID,
      profile: SEED_USER.profile,
      preferences: SEED_USER.preferences,
      settings: { availability: { noticePeriodDays: "thirty" } },
    });
    await expect(loadUser(repo, DEMO_UID)).rejects.toBeInstanceOf(UserDocInvalidError);
  });

  it("reports a missing user instead of returning an empty one", async () => {
    await expect(loadUser(new InMemoryRepo(), DEMO_UID)).rejects.toBeInstanceOf(UserNotFoundError);
  });
});

describe("the seed", () => {
  it("is a valid storage-level user document", () => {
    expect(() => userDocSchema.parse({ uid: DEMO_UID, ...SEED_USER })).not.toThrow();
  });

  it("never stores compensation or salary", () => {
    const keys = allKeys(SEED_USER);
    expect(keys.filter((k) => /salary|compensation|ctc|lpa|pay/i.test(k))).toEqual([]);
  });

  it("traces every rubric rule to a verbatim quote from the job-search prompt (D6)", () => {
    const p = SEED_USER.preferences;
    const quotes = [
      p.goal.source,
      p.location.source,
      p.excludedTitles.source,
      p.companyBlocks.allowedExceptions.source,
      p.verdictBands.source,
      p.tierFraming.source,
      ...p.companyBlocks.categories.map((c) => c.source),
      ...p.hardBlocks.map((r) => r.source),
      ...p.languageGate.map((r) => r.source),
      ...p.fitCriteria.map((c) => c.source),
    ];
    for (const quote of quotes) expect(jobSearchPrompt).toContain(quote);
  });

  it("keeps the prompt's fit weights", () => {
    const weights = Object.fromEntries(
      SEED_USER.preferences.fitCriteria.map((c) => [c.id, c.weight]),
    );
    expect(weights).toEqual({
      title_manager: 3,
      title_lead_ic: 2,
      title_senior_ic: 1,
      stack_primary: 3,
      stack_partial: 1,
      realtime_data: 1,
      hands_on_leadership: 1,
      startup: 1,
      experience_band: 1,
      llm_features: 1,
      pure_people_management: -1,
      ic_unused_stack: -2,
    });
    expect(SEED_USER.preferences.fitCap).toBe(10);
    expect(SEED_USER.preferences.verdictBands).toMatchObject({ applyNowMinFit: 7, applyMinFit: 5 });
  });

  it("takes contact details and experience from the resume and settings sources", () => {
    const { profile, settings } = SEED_USER;
    for (const value of [profile.email, profile.phone, profile.location]) {
      expect(resume).toContain(value);
      expect(settingsSource).toContain(value);
    }
    for (const role of profile.experience) {
      expect(resume).toContain(role.company);
      expect(resume).toContain(role.title);
      for (const highlight of role.highlights) expect(resume).toContain(highlight);
    }
    expect(settingsSource).toContain(`School: ${settings.education.school}`);
    expect(settingsSource).toContain(`Highest degree: ${settings.education.highestDegree}`);
  });

  it("leaves unstated fields empty so they resolve to user-only", () => {
    expect(SEED_USER.settings.location.postalAddress).toBeNull();
    expect(SEED_USER.settings.location.citizenship).toBeNull();
    expect(SEED_USER.settings.documents).toEqual({ resumeUrl: null, coverLetter: null });
  });
});

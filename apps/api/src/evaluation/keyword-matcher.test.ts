import { describe, expect, it } from "vitest";
import type { FitCriterion, Posting } from "@auto-apply/shared";
import { SEED_USER } from "../seed-user.js";
import { keywordMatcher } from "./keyword-matcher.js";
import { buildRubric, judgeInCode } from "./rubric.js";

function aPosting(overrides: Partial<Posting> = {}): Posting {
  return {
    ats: "greenhouse",
    board: "acme",
    jobId: "1",
    title: "Senior Engineer",
    company: "Acme",
    location: "Remote - India",
    descriptionText: "",
    applyUrl: "https://boards.greenhouse.io/acme/jobs/1",
    remote: true,
    source: "live",
    ...overrides,
  };
}

const criteria: FitCriterion[] = [
  {
    id: "realtime_data",
    label: "Real-time, IoT or high-volume data",
    weight: 1,
    group: null,
    terms: ["real-time", "IoT", "high-volume"],
    source: "+1 real-time/IoT/high-volume data",
  },
  {
    id: "startup",
    label: "Startup or scale-up",
    weight: 1,
    group: null,
    terms: ["startup", "scale-up"],
    source: "+1 startup/scale-up",
  },
  {
    id: "experience_band",
    label: "Experience band within 5-9 years",
    weight: 1,
    group: null,
    terms: [],
    source: "+1 experience band within 5-9 years",
  },
];

describe("keywordMatcher (D24 fallback)", () => {
  it("labels its judgements as fallback scoring", async () => {
    const result = await keywordMatcher.evaluate(aPosting(), criteria);

    expect(result.scoredBy).toBe("fallback");
  });

  it("judges each criterion it is given, met when a term appears, quoting the matched snippet", async () => {
    const description =
      "We are a fast-growing scale-up in Bengaluru. You will build our ingestion layer for " +
      "Real time telemetry from thousands of devices, and mentor two engineers.";
    const { judgements } = await keywordMatcher.evaluate(
      aPosting({ descriptionText: description }),
      criteria,
    );

    expect(judgements.map((j) => [j.criterionId, j.met])).toEqual([
      ["realtime_data", true],
      ["startup", true],
      ["experience_band", false],
    ]);
    const [realtime, startup, band] = judgements;
    expect(realtime?.evidence).toContain("Real time telemetry");
    expect(description).toContain(realtime?.evidence.replace(/^…|…$/g, ""));
    expect(startup?.evidence).toContain("scale-up");
    // A criterion with no keywords is never met by the matcher, and has no quote.
    expect(band?.evidence).toBe("");
  });

  it("keeps the quote short", async () => {
    const filler = "lorem ipsum dolor sit amet ".repeat(40);
    const { judgements } = await keywordMatcher.evaluate(
      aPosting({ descriptionText: `${filler} IoT platform ${filler}` }),
      criteria,
    );

    const quote = judgements[0]?.evidence ?? "";
    expect(quote).toContain("IoT platform");
    expect(quote.length).toBeLessThanOrEqual(160);
  });

  it("does not match a term inside another word", async () => {
    const { judgements } = await keywordMatcher.evaluate(
      aPosting({ descriptionText: "Our startups portfolio team" }),
      [criteria[1] as FitCriterion],
    );

    expect(judgements[0]?.met).toBe(false);
  });
});

describe("judgeInCode (title tier)", () => {
  const rubric = buildRubric(SEED_USER.preferences);

  it.each<[string, string[]]>([
    ["Engineering Manager, Payments", ["title_manager"]],
    ["Staff Software Engineer", ["title_lead_ic"]],
    ["Tech Lead - Platform", ["title_manager", "title_lead_ic"]],
    ["Senior Software Engineer, Backend", ["title_senior_ic"]],
    ["Software Engineer", []],
  ])("%s meets %j, quoting the title", (title, metIds) => {
    const judged = judgeInCode(rubric, title);

    expect(judged.filter((j) => j.met).map((j) => j.criterionId)).toEqual(metIds);
    expect(judged.filter((j) => j.met).every((j) => j.evidence === title)).toBe(true);
  });
});

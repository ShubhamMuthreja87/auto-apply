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
    // No stated experience: unknown, so not met, and no quote.
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

describe("keywordMatcher: the seeded criteria with no terms of their own (D8 gaps)", () => {
  const seeded = SEED_USER.preferences.fitCriteria;
  const byId = (id: string) => {
    const criterion = seeded.find((c) => c.id === id);
    if (!criterion) throw new Error(`no seeded criterion ${id}`);
    return criterion;
  };

  async function judge(id: string, overrides: Partial<Posting>) {
    const { judgements } = await keywordMatcher.evaluate(aPosting(overrides), [byId(id)]);
    return judgements[0];
  }

  it.each<[string, string, Partial<Posting>, boolean]>([
    // -2 IC in a stack he does not use: the prompt's NOT list, named in an IC title.
    ["ic_unused_stack", "a Java IC title", { title: "Senior Java Developer" }, true],
    ["ic_unused_stack", "a Go IC title", { title: "Backend Engineer (Go)" }, true],
    ["ic_unused_stack", "a Golang IC title", { title: "Golang Engineer" }, true],
    ["ic_unused_stack", "a .NET IC title", { title: "Senior .NET Engineer" }, true],
    ["ic_unused_stack", "an Angular IC title", { title: "Angular Frontend Engineer" }, true],
    ["ic_unused_stack", "JavaScript is not Java", { title: "Senior JavaScript Engineer" }, false],
    ["ic_unused_stack", "a manager title is not IC", { title: "Engineering Manager, Java" }, false],
    [
      "ic_unused_stack",
      "the stack only mentioned in passing",
      { title: "Senior Engineer", descriptionText: "Nice to have: Kubernetes, Go." },
      false,
    ],
    ["ic_unused_stack", "nothing stated", { title: "Software Engineer" }, false],
    // -1 pure people management.
    [
      "pure_people_management",
      "no coding stated",
      { descriptionText: "This is a non-hands-on role focused on people management." },
      true,
    ],
    [
      "pure_people_management",
      "will not write code",
      { descriptionText: "You will not be writing code day to day." },
      true,
    ],
    [
      "pure_people_management",
      "a hands-on manager",
      { descriptionText: "A hands-on manager who still codes." },
      false,
    ],
    ["pure_people_management", "nothing stated", { descriptionText: "" }, false],
    // +1 experience band within 5-9 years.
    ["experience_band", "5+ years", { descriptionText: "- 5+ years of experience" }, true],
    ["experience_band", "a 6-9 range", { descriptionText: "6-9 years of experience" }, true],
    ["experience_band", "3+ years", { descriptionText: "3+ years of experience" }, false],
    ["experience_band", "no years stated", { descriptionText: "Lead a team." }, false],
    // +1 partial stack overlap.
    [
      "stack_partial",
      "a working-knowledge stack",
      { descriptionText: "Our services run on Python and PostgreSQL." },
      true,
    ],
    ["stack_partial", "no stack stated", { descriptionText: "Lead a team." }, false],
  ])("%s: %s → met %s", async (id, _case, overrides, met) => {
    const judgement = await judge(id, overrides);
    expect(judgement?.met).toBe(met);
    if (met) expect(judgement?.evidence).not.toBe("");
    else expect(judgement?.evidence).toBe("");
  });

  it("a user's own terms for such a criterion replace the defaults", async () => {
    const custom = { ...byId("pure_people_management"), terms: ["org design"] };
    const { judgements } = await keywordMatcher.evaluate(
      aPosting({ descriptionText: "You will not be writing code. You will own org design." }),
      [custom],
    );
    expect(judgements[0]?.evidence).toContain("org design");
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

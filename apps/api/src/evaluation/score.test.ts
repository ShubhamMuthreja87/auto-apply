import { describe, expect, it } from "vitest";
import type { FitCriterion, Verdict } from "@auto-apply/shared";
import { SEED_USER } from "../seed-user.js";
import { buildRubric, type Rubric } from "./rubric.js";
import { scoreJudgements, verdictFor } from "./score.js";

const bands = { applyNowMinFit: 7, applyMinFit: 5 };

describe("verdictFor (D8 bands)", () => {
  it.each<[number, boolean, Verdict]>([
    [10, false, "APPLY_NOW"],
    [7, false, "APPLY_NOW"],
    [7, true, "APPLY"], // "7+ with minor gaps"
    [9, true, "APPLY"],
    [6, false, "APPLY"],
    [5, false, "APPLY"],
    [5, true, "APPLY"],
    [4, false, "STRETCH"],
    [0, false, "STRETCH"],
    [-2, true, "STRETCH"],
  ])("fit %i with gaps=%s → %s", (score, hasGaps, verdict) => {
    expect(verdictFor(score, hasGaps, bands)).toBe(verdict);
  });
});

describe("buildRubric (D6)", () => {
  const rubric = buildRubric(SEED_USER.preferences);

  it("takes every fit criterion, weight and quote from the preferences", () => {
    expect(rubric.criteria.map((c) => [c.id, c.weight])).toEqual([
      ["title_manager", 3],
      ["title_lead_ic", 2],
      ["title_senior_ic", 1],
      ["stack_primary", 3],
      ["stack_partial", 1],
      ["realtime_data", 1],
      ["hands_on_leadership", 1],
      ["startup", 1],
      ["experience_band", 1],
      ["llm_features", 1],
      ["pure_people_management", -1],
      ["ic_unused_stack", -2],
    ]);
    expect(rubric.criteria.find((c) => c.id === "startup")?.source).toBe("+1 startup/scale-up");
    expect(rubric.fitCap).toBe(10);
    expect(rubric.bands).toEqual({ applyNowMinFit: 7, applyMinFit: 5 });
  });

  it("has code judge only the title tier; judgement over prose goes to the AI", () => {
    const codeJudged = rubric.criteria.filter((c) => c.judgedBy === "code").map((c) => c.id);
    expect(codeJudged).toEqual(["title_manager", "title_lead_ic", "title_senior_ic"]);
  });
});

function criterion(id: string, weight: number, group: string | null = null): FitCriterion {
  return { id, label: id, weight, group, terms: [], source: id };
}

const testRubric: Rubric = buildRubric({
  ...SEED_USER.preferences,
  fitCriteria: [
    criterion("title_manager", 3, "title"),
    criterion("title_lead_ic", 2, "title"),
    criterion("stack_primary", 3, "stack"),
    criterion("stack_partial", 1, "stack"),
    criterion("realtime", 1),
    criterion("startup", 1),
    criterion("llm", 1),
    criterion("hands_on", 1),
    criterion("bonus_a", 2),
    criterion("pure_people", -1),
  ],
});

function met(...ids: string[]) {
  return ids.map((id) => ({ criterionId: id, met: true, evidence: `quote for ${id}` }));
}

describe("scoreJudgements (D7: code sums, code decides)", () => {
  it.each<[string, string[], number, Verdict]>([
    ["nothing met", [], 0, "STRETCH"],
    ["manager + primary stack", ["title_manager", "stack_primary"], 6, "APPLY"],
    [
      "manager + primary stack + startup",
      ["title_manager", "stack_primary", "startup"],
      7,
      "APPLY_NOW",
    ],
    [
      "highest only within a group",
      ["title_manager", "title_lead_ic", "stack_primary", "stack_partial"],
      6,
      "APPLY",
    ],
    [
      "the lower title alone counts when it is the only one",
      ["title_lead_ic", "stack_partial"],
      3,
      "STRETCH",
    ],
    [
      "a met penalty is a gap: 7+ drops to APPLY",
      ["title_manager", "stack_primary", "startup", "realtime", "pure_people"],
      7,
      "APPLY",
    ],
    [
      "capped at the fit cap",
      ["title_manager", "stack_primary", "realtime", "startup", "llm", "hands_on", "bonus_a"],
      10,
      "APPLY_NOW",
    ],
    ["never below zero", ["pure_people"], 0, "STRETCH"],
  ])("%s → fit %i, %s", (_name, metIds, score, verdict) => {
    const result = scoreJudgements(testRubric, met(...metIds));

    expect(result.score).toBe(score);
    expect(result.verdict).toBe(verdict);
  });

  it("keeps every criterion's evidence, and the points each one added", () => {
    const result = scoreJudgements(testRubric, met("title_manager", "title_lead_ic", "startup"));

    const byId = new Map(result.evidence.map((e) => [e.criterionId, e]));
    expect(result.evidence).toHaveLength(10);
    expect(byId.get("title_manager")).toMatchObject({
      met: true,
      evidence: "quote for title_manager",
      points: 3,
      weight: 3,
      judgedBy: "code",
    });
    // Met, but outscored by the manager title in its group.
    expect(byId.get("title_lead_ic")).toMatchObject({ met: true, points: 0 });
    expect(byId.get("startup")).toMatchObject({ met: true, points: 1, judgedBy: "ai" });
    // Unanswered criteria are not met and add nothing.
    expect(byId.get("realtime")).toMatchObject({ met: false, evidence: "", points: 0 });
  });

  it("ignores judgements for criteria not in the rubric", () => {
    const result = scoreJudgements(testRubric, met("made_up", "startup"));

    expect(result.score).toBe(1);
    expect(result.evidence.map((e) => e.criterionId)).not.toContain("made_up");
  });
});

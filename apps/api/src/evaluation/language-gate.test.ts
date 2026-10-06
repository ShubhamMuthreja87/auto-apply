/**
 * The language gate (job-search prompt, LANGUAGE GATE): applied after the fit
 * score, IC titles only. Table-driven over the seeded preferences.
 */
import { describe, expect, it } from "vitest";
import type { Posting, UserPreferences } from "@auto-apply/shared";
import type { CriterionJudgement } from "../pipeline/ports.js";
import { SEED_USER } from "../seed-user.js";
import { applyLanguageGate, languageGateQuestions } from "./language-gate.js";
import { buildRubric, judgeInCode } from "./rubric.js";
import { scoreJudgements } from "./score.js";

const preferences = SEED_USER.preferences;

function aPosting(overrides: Partial<Posting> = {}): Posting {
  return {
    ats: "greenhouse",
    board: "acme",
    jobId: "1",
    title: "Staff Engineer",
    company: "Acme",
    location: "Bengaluru, India",
    descriptionText: "",
    applyUrl: "https://boards.greenhouse.io/acme/jobs/1",
    remote: false,
    source: "live",
    ...overrides,
  };
}

/** Every AI-side criterion met with a quote, so the fit score is high (APPLY NOW). */
function strongJudgements(prefs: UserPreferences, except: string[] = []): CriterionJudgement[] {
  return prefs.fitCriteria
    .filter((c) => c.weight > 0 && c.group !== "title" && !except.includes(c.id))
    .map((c) => ({ criterionId: c.id, met: true, evidence: c.label }));
}

function gate(
  posting: Posting,
  options: { prefs?: UserPreferences; extra?: CriterionJudgement[]; except?: string[] } = {},
) {
  const prefs = options.prefs ?? preferences;
  const rubric = buildRubric(prefs);
  const judgements = [...strongJudgements(prefs, options.except), ...(options.extra ?? [])];
  const scored = scoreJudgements(rubric, [...judgeInCode(rubric, posting.title), ...judgements]);
  return { before: scored, after: applyLanguageGate(prefs, posting, scored, judgements) };
}

describe("applyLanguageGate", () => {
  it.each<[string, Partial<Posting>, string[], string]>([
    ["a JS/TS IC role is normal", { title: "Staff Engineer, React" }, [], "APPLY_NOW"],
    ["a Python-titled IC caps at APPLY", { title: "Staff Python Engineer" }, [], "APPLY"],
    ["a Java-titled IC goes to STRETCH", { title: "Staff Java Engineer" }, [], "STRETCH"],
    ["a Go-titled IC goes to STRETCH", { title: "Staff Engineer (Go)" }, [], "STRETCH"],
    ["a mobile IC goes to STRETCH", { title: "Staff Mobile Engineer" }, [], "STRETCH"],
    [
      "an AI-titled IC caps at APPLY when the stack is not JS/TS",
      { title: "Staff AI Engineer" },
      ["stack_primary"],
      "APPLY",
    ],
    [
      "an AI-titled IC on a JS/TS stack is not capped",
      { title: "Staff AI Engineer" },
      [],
      "APPLY_NOW",
    ],
    ["never for manager titles", { title: "Engineering Manager, Python" }, [], "APPLY_NOW"],
    ["never for a Java manager", { title: "Engineering Manager, Java Platform" }, [], "APPLY_NOW"],
    ["unknown stack: no cap", { title: "Staff Engineer", descriptionText: "" }, [], "APPLY_NOW"],
    ["'go' as a word is not Go", { title: "Staff Engineer, go-to-market" }, [], "APPLY_NOW"],
  ])("%s → %s", (_case, overrides, except, verdict) => {
    const { before, after } = gate(aPosting(overrides), { except });
    expect(before.verdict).toBe(except.length > 0 ? before.verdict : "APPLY_NOW");
    expect(after.verdict).toBe(verdict);
    expect(after.score).toBe(before.score);
  });

  it("never raises a Verdict, only caps it", () => {
    const posting = aPosting({ title: "Python Engineer" });
    const rubric = buildRubric(preferences);
    const scored = scoreJudgements(rubric, judgeInCode(rubric, posting.title));
    expect(scored.verdict).toBe("STRETCH");
    expect(applyLanguageGate(preferences, posting, scored, []).verdict).toBe("STRETCH");
  });

  it("records the gate as evidence, so the UI shows why the Verdict was capped", () => {
    const { after } = gate(aPosting({ title: "Staff Python Engineer" }));
    const gateEvidence = after.evidence.filter((e) => e.criterionId.startsWith("gate:"));
    expect(gateEvidence).toEqual([
      {
        criterionId: "gate:python_primary_ic",
        label: "Language gate: Python-primary IC role (caps at APPLY)",
        weight: 0,
        judgedBy: "code",
        met: true,
        evidence: "Staff Python Engineer",
        points: 0,
      },
    ]);
  });

  it("caps on the AI's judgement that the description's primary stack is gated", () => {
    const { after } = gate(
      aPosting({
        title: "Staff Backend Engineer",
        descriptionText: "Our backend is written in Python and Django.",
      }),
      {
        except: ["stack_primary"],
        extra: [
          {
            criterionId: "gate:python_primary_ic",
            met: true,
            evidence: "Our backend is written in Python and Django.",
          },
        ],
      },
    );
    expect(after.verdict).toBe("APPLY");
    expect(after.evidence.find((e) => e.criterionId === "gate:python_primary_ic")).toMatchObject({
      judgedBy: "ai",
      evidence: "Our backend is written in Python and Django.",
    });
  });

  it("the strictest triggered cap wins", () => {
    const { after } = gate(aPosting({ title: "Staff Python and Java Engineer" }));
    expect(after.verdict).toBe("STRETCH");
  });

  it("follows the preferences: an edited cap or removed rule takes effect", () => {
    const stricter: UserPreferences = {
      ...preferences,
      languageGate: preferences.languageGate.map((rule) =>
        rule.id === "python_primary_ic" ? { ...rule, cap: "STRETCH" } : rule,
      ),
    };
    expect(
      gate(aPosting({ title: "Staff Python Engineer" }), { prefs: stricter }).after.verdict,
    ).toBe("STRETCH");
    const none: UserPreferences = { ...preferences, languageGate: [] };
    expect(gate(aPosting({ title: "Staff Python Engineer" }), { prefs: none }).after.verdict).toBe(
      "APPLY_NOW",
    );
  });
});

describe("languageGateQuestions", () => {
  it("asks the evaluator about each gate rule, with no keyword terms (unknown → not met)", () => {
    const questions = languageGateQuestions(preferences);
    expect(questions.map((q) => q.id)).toEqual([
      "gate:python_primary_ic",
      "gate:other_stack_or_mobile_ic",
      "gate:ai_titled_ic",
    ]);
    expect(questions.every((q) => q.terms.length === 0 && q.weight === 0)).toBe(true);
    expect(questions[0]?.label).toMatch(/primary/i);
  });
});

/**
 * The static weighted rubric (D6), derived from the user's preferences: each
 * fit criterion with its weight, its "highest only" group, its quote from the
 * job-search prompt, and which side of the reliability split judges it.
 *
 * Code judges only what it can parse properly. Of the fit criteria that is the
 * title tier (the Posting's title is a short structured field); location,
 * remote and pay are parsed in code too, but they are hard blocks
 * (`screen.ts`), not points. Everything else needs judgement over prose and
 * goes to the `JobEvaluator` (the AI, or the keyword matcher as fallback).
 */
import type { FitCriterion, JudgedBy, UserPreferences } from "@auto-apply/shared";
import { containsTerm } from "./screen.js";

export interface RubricCriterion extends FitCriterion {
  judgedBy: JudgedBy;
}

export interface Rubric {
  criteria: RubricCriterion[];
  fitCap: number;
  bands: { applyNowMinFit: number; applyMinFit: number };
}

/** Groups of criteria judged in code: the title tier. */
const CODE_JUDGED_GROUPS: ReadonlySet<string> = new Set(["title"]);

export function buildRubric(preferences: UserPreferences): Rubric {
  return {
    criteria: preferences.fitCriteria.map((criterion) => ({
      ...criterion,
      judgedBy: criterion.group !== null && CODE_JUDGED_GROUPS.has(criterion.group) ? "code" : "ai",
    })),
    fitCap: preferences.fitCap,
    bands: {
      applyNowMinFit: preferences.verdictBands.applyNowMinFit,
      applyMinFit: preferences.verdictBands.applyMinFit,
    },
  };
}

/** The criteria the `JobEvaluator` is asked to judge. */
export function aiCriteria(rubric: Rubric): RubricCriterion[] {
  return rubric.criteria.filter((c) => c.judgedBy === "ai");
}

/**
 * Judges the code-side criteria: a title criterion is met when the Posting's
 * title names one of its terms; the evidence is the title itself.
 */
export function judgeInCode(
  rubric: Rubric,
  title: string,
): { criterionId: string; met: boolean; evidence: string }[] {
  return rubric.criteria
    .filter((c) => c.judgedBy === "code")
    .map((c) => {
      const met = c.terms.some((term) => containsTerm(title, term));
      return { criterionId: c.id, met, evidence: met ? title : "" };
    });
}

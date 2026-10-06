/**
 * Scoring (D7, D8): pure code turns per-criterion judgements into a fit score
 * and a Verdict. The judges (code, the AI, the keyword matcher) only say
 * met-or-not with a quote; every point here traces to one of those quotes.
 *
 * - A met criterion adds its weight; negative weights are penalties.
 * - Within a group ("title, highest only", "Stack: +3 … else +1") only the
 *   highest-weighted met criterion counts.
 * - The sum is clamped to 0…fitCap ("FIT 1-10 (cap 10)").
 * - A met penalty is a gap: "APPLY NOW = fit 7+ with no gaps. APPLY = fit 5-6,
 *   or 7+ with minor gaps." Below the APPLY band is STRETCH.
 */
import type { CriterionEvidence, Verdict } from "@auto-apply/shared";
import type { CriterionJudgement } from "../pipeline/ports.js";
import type { Rubric } from "./rubric.js";

export interface Scored {
  score: number;
  verdict: Verdict;
  evidence: CriterionEvidence[];
}

export function verdictFor(
  score: number,
  hasGaps: boolean,
  bands: Rubric["bands"],
): Exclude<Verdict, "BLOCKED"> {
  if (score >= bands.applyNowMinFit) return hasGaps ? "APPLY" : "APPLY_NOW";
  if (score >= bands.applyMinFit) return "APPLY";
  return "STRETCH";
}

export function scoreJudgements(
  rubric: Rubric,
  judgements: readonly Pick<CriterionJudgement, "criterionId" | "met" | "evidence">[],
): Scored {
  const byId = new Map(judgements.map((j) => [j.criterionId, j]));
  const judged = rubric.criteria.map((criterion) => {
    const judgement = byId.get(criterion.id);
    return { criterion, met: judgement?.met ?? false, evidence: judgement?.evidence ?? "" };
  });

  // The criterion that counts in each group: the highest-weighted met one.
  const groupWinner = new Map<string, string>();
  for (const { criterion, met } of judged) {
    if (!met || criterion.group === null) continue;
    const winnerId = groupWinner.get(criterion.group);
    const winner = rubric.criteria.find((c) => c.id === winnerId);
    if (!winner || criterion.weight > winner.weight) groupWinner.set(criterion.group, criterion.id);
  }

  const evidence: CriterionEvidence[] = judged.map(({ criterion, met, evidence: quote }) => {
    const counts =
      met && (criterion.group === null || groupWinner.get(criterion.group) === criterion.id);
    return {
      criterionId: criterion.id,
      label: criterion.label,
      weight: criterion.weight,
      judgedBy: criterion.judgedBy,
      met,
      evidence: quote,
      points: counts ? criterion.weight : 0,
    };
  });

  const sum = evidence.reduce((total, e) => total + e.points, 0);
  const score = Math.min(rubric.fitCap, Math.max(0, sum));
  const hasGaps = evidence.some((e) => e.points < 0);
  return { score, verdict: verdictFor(score, hasGaps, rubric.bands), evidence };
}

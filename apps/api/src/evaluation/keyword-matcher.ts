/**
 * The keyword fallback matcher (D24): a `JobEvaluator` that needs no AI. A
 * criterion is met when the Posting's title or description names one of the
 * criterion's `terms` as a whole word or phrase; the evidence is the matched
 * snippet, quoted verbatim. A criterion with no terms ("experience band",
 * "pure people management") needs judgement the matcher cannot make, so it is
 * never met here. Its judgements are labelled `fallback`, so the UI can say
 * "fallback scoring".
 */
import type { FitCriterion, Posting } from "@auto-apply/shared";
import type { CriterionJudgement, JobEvaluator } from "../pipeline/ports.js";
import { findTerm } from "./screen.js";

/** Characters kept either side of a match in the quoted snippet. */
const CONTEXT_CHARS = 60;

/** A verbatim window of `text` around a match, trimmed to whole words. */
function snippet(text: string, index: number, length: number): string {
  let start = Math.max(0, index - CONTEXT_CHARS);
  let end = Math.min(text.length, index + length + CONTEXT_CHARS);
  if (start > 0) {
    const space = text.indexOf(" ", start);
    if (space !== -1 && space < index) start = space + 1;
  }
  if (end < text.length) {
    const space = text.lastIndexOf(" ", end);
    if (space >= index + length) end = space;
  }
  const quote = text.slice(start, end).trim();
  return `${start > 0 ? "…" : ""}${quote}${end < text.length ? "…" : ""}`;
}

function judge(posting: Posting, criterion: FitCriterion): CriterionJudgement {
  for (const text of [posting.title, posting.descriptionText]) {
    for (const term of criterion.terms) {
      const found = findTerm(text, term);
      if (found) {
        return {
          criterionId: criterion.id,
          met: true,
          evidence: snippet(text, found.index, found.length),
        };
      }
    }
  }
  return { criterionId: criterion.id, met: false, evidence: "" };
}

export const keywordMatcher: JobEvaluator = {
  evaluate: async (posting, criteria) => ({
    scoredBy: "fallback",
    judgements: criteria.map((criterion) => judge(posting, criterion)),
  }),
};

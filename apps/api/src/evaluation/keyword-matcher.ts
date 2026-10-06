/**
 * The keyword fallback matcher (D24): a `JobEvaluator` that needs no AI. A
 * criterion is met when the Posting's title or description names one of the
 * criterion's `terms` as a whole word or phrase; the evidence is the matched
 * snippet, quoted verbatim. Its judgements are labelled `fallback`, so the UI
 * can say "fallback scoring".
 *
 * The seeded criteria the prompt words without keywords ("experience band",
 * "partial overlap", "-1 pure people management", "-2 IC in a stack he does
 * not use") get default judges here, built from the prompt's own lists, so a
 * penalty can still be met and count as a gap under fallback scoring (D8).
 * They apply only while the criterion has no terms of its own; a user's terms
 * replace them. Whatever the Posting does not state is unknown: not met.
 */
import type { FitCriterion, Posting } from "@auto-apply/shared";
import type { CriterionJudgement, JobEvaluator } from "../pipeline/ports.js";
import { findTerm, statedExperienceMinimum } from "./screen.js";

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

/** The first of `terms` named in any of `texts`, quoted; `null` when none is. */
function quoteFirst(texts: readonly string[], terms: readonly string[]): string | null {
  for (const text of texts) {
    for (const term of terms) {
      const found = findTerm(text, term);
      if (found) return snippet(text, found.index, found.length);
    }
  }
  return null;
}

/** "NOT: Java, Spring, Go, Rust, .NET, Angular, Kubernetes" (job-search prompt), as title words. */
const NOT_STACK_TITLE_TERMS = [
  "Java",
  "Spring",
  "Go",
  "Golang",
  "Rust",
  ".NET",
  "C#",
  "Angular",
  "Kubernetes",
];

/** The prompt's working-knowledge stack plus the strong stack beyond JS/TS/Node/React. */
const PARTIAL_STACK_TERMS = [
  "Python",
  "FastAPI",
  "LangChain",
  "RAG",
  "PostgreSQL",
  "SQL",
  "Redis",
  "Docker",
  "AWS",
  "MongoDB",
  "Express",
  "Next.js",
];

/** Wording that says the role is people management with no hands-on engineering. */
const PEOPLE_MANAGEMENT_ONLY_TERMS = [
  "non-hands-on",
  "not hands-on",
  "not a hands-on",
  "no hands-on coding",
  "not be writing code",
  "not writing code",
  "will not code",
  "won't be coding",
  "no coding",
  "does not code",
  "pure people management",
  "purely people management",
  "people management only",
  "100% people management",
];

/** A manager title ("-2 IC in a stack …" is for IC titles only). */
const managerTitle =
  /\b(manager|head of|director|vice president|vp|tech(?:nical)? lead|team lead|engineering lead)\b/i;

type DefaultJudge = (posting: Posting) => string | null;

const defaultJudges: Record<string, DefaultJudge> = {
  ic_unused_stack: ({ title }) =>
    managerTitle.test(title) ? null : quoteFirst([title], NOT_STACK_TITLE_TERMS),

  pure_people_management: ({ descriptionText }) =>
    quoteFirst([descriptionText], PEOPLE_MANAGEMENT_ONLY_TERMS),

  stack_partial: ({ title, descriptionText }) =>
    quoteFirst([title, descriptionText], PARTIAL_STACK_TERMS),

  experience_band: ({ descriptionText }) => {
    const minimum = statedExperienceMinimum(descriptionText);
    if (minimum === null || minimum < 5 || minimum > 9) return null;
    const line = descriptionText.split("\n").find((l) => /experience/i.test(l) && /\d/.test(l));
    return line ? line.trim().slice(0, 160) : `${minimum}+ years`;
  },
};

function judge(posting: Posting, criterion: FitCriterion): CriterionJudgement {
  const defaultJudge = criterion.terms.length === 0 ? defaultJudges[criterion.id] : undefined;
  const evidence = defaultJudge
    ? defaultJudge(posting)
    : quoteFirst([posting.title, posting.descriptionText], criterion.terms);
  return evidence
    ? { criterionId: criterion.id, met: true, evidence }
    : { criterionId: criterion.id, met: false, evidence: "" };
}

export const keywordMatcher: JobEvaluator = {
  evaluate: async (posting, criteria) => ({
    scoredBy: "fallback",
    judgements: criteria.map((criterion) => judge(posting, criterion)),
  }),
};

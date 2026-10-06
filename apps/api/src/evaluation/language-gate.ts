/**
 * The language gate, applied after the fit score (job-search prompt):
 * "LANGUAGE GATE (IC titles only, never manager titles): JS/TS/Node/React
 * primary is normal. Python-primary IC caps at APPLY. Java/Go/Rust/.NET/
 * Angular-first or mobile-only IC goes to STRETCH. AI-titled IC roles cap at
 * APPLY unless the stack is JS/TS."
 *
 * The rules come from `preferences.languageGate`, so Settings edits apply to
 * the next Run. A rule is triggered for an IC title in one of two ways:
 *
 * - **Code, from the title**: the title names one of the rule's terms ("Senior
 *   Python Engineer", "Backend Engineer (Go)"). A title is a short structured
 *   field, the same reliability split as the title tier (`rubric.ts`).
 * - **The evaluator, from the description**: whether a stack is a role's
 *   *primary* one is judgement over prose, so each rule is also asked as a
 *   zero-weight question ({@link languageGateQuestions}) and a "met" with a
 *   verified quote triggers it. The keyword matcher has no terms for these
 *   questions, so under fallback scoring only the title can trigger the gate.
 *
 * Unknown means no cap: a Posting that names no stack is never capped. A
 * manager title (the code-judged `title_manager` criterion) is never gated.
 * The AI-titled rule is waived when JS/TS/Node/React is the primary stack
 * (`stack_primary` met). Every triggered rule is recorded as evidence (weight
 * 0, no points) so the UI shows why the Verdict was capped.
 */
import type {
  CriterionEvidence,
  FitCriterion,
  LanguageGateRule,
  Posting,
  UserPreferences,
  Verdict,
} from "@auto-apply/shared";
import type { CriterionJudgement } from "../pipeline/ports.js";
import type { Scored } from "./score.js";
import { containsTerm } from "./screen.js";

const GATE_PREFIX = "gate:";
/** The code-judged title criterion that marks a manager title (also D12 framing). */
const MANAGER_CRITERION_ID = "title_manager";
/** "JS/TS/Node/React primary" (the seeded stack criterion). */
const JS_TS_PRIMARY_CRITERION_ID = "stack_primary";
/** Rules the prompt waives when the stack is JS/TS: "unless the stack is JS/TS". */
const WAIVED_ON_JS_TS = new Set(["ai_titled_ic"]);

const verdictRank: Record<Verdict, number> = { BLOCKED: 0, STRETCH: 1, APPLY: 2, APPLY_NOW: 3 };

/** The evaluator's question for a gate rule; its id is `gate:<rule id>`. */
export function languageGateQuestions(preferences: UserPreferences): FitCriterion[] {
  return preferences.languageGate.map((rule) => ({
    id: `${GATE_PREFIX}${rule.id}`,
    label:
      `Language gate: ${rule.label}. Met only when the posting states that this is the ` +
      "role's primary stack or focus (or its title says so); a stack merely listed, or not stated, is not met",
    weight: 0,
    group: null,
    terms: [],
    source: rule.source,
  }));
}

/** Where a triggered rule's evidence came from, or `null` when it is not triggered. */
function triggerFor(
  rule: LanguageGateRule,
  posting: Posting,
  aiJudgements: ReadonlyMap<string, CriterionJudgement>,
): Pick<CriterionEvidence, "judgedBy" | "evidence"> | null {
  if (rule.terms.some((term) => containsTerm(posting.title, term))) {
    return { judgedBy: "code", evidence: posting.title };
  }
  const judged = aiJudgements.get(`${GATE_PREFIX}${rule.id}`);
  if (judged?.met && judged.evidence.trim() !== "") {
    return { judgedBy: "ai", evidence: judged.evidence };
  }
  return null;
}

/**
 * Caps `scored`'s Verdict by every gate rule the Posting triggers (the
 * strictest wins) and appends their evidence. The score is unchanged; a
 * Verdict is never raised.
 */
export function applyLanguageGate(
  preferences: UserPreferences,
  posting: Posting,
  scored: Scored,
  judgements: readonly CriterionJudgement[],
): Scored {
  const met = (id: string) => scored.evidence.some((e) => e.criterionId === id && e.met);
  if (met(MANAGER_CRITERION_ID)) return scored;

  const aiJudgements = new Map(judgements.map((j) => [j.criterionId, j]));
  const jsTsPrimary = met(JS_TS_PRIMARY_CRITERION_ID);
  let verdict = scored.verdict;
  const gateEvidence: CriterionEvidence[] = [];
  for (const rule of preferences.languageGate) {
    if (jsTsPrimary && WAIVED_ON_JS_TS.has(rule.id)) continue;
    const trigger = triggerFor(rule, posting, aiJudgements);
    if (!trigger) continue;
    gateEvidence.push({
      criterionId: `${GATE_PREFIX}${rule.id}`,
      label: `Language gate: ${rule.label} (caps at ${rule.cap})`,
      weight: 0,
      met: true,
      points: 0,
      ...trigger,
    });
    if (verdictRank[rule.cap] < verdictRank[verdict]) verdict = rule.cap;
  }
  if (gateEvidence.length === 0) return scored;
  return { score: scored.score, verdict, evidence: [...scored.evidence, ...gateEvidence] };
}

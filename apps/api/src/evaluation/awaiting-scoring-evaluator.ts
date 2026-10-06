/**
 * Superseded by the keyword matcher (`keyword-matcher.ts`, ticket 08) and no
 * longer wired anywhere; kept only until a human approves deleting it.
 *
 * The interim `JobEvaluator` from ticket 07: it judges no criteria.
 */
import type { JobEvaluator } from "../pipeline/ports.js";

export const awaitingScoringEvaluator: JobEvaluator = {
  evaluate: async () => ({ scoredBy: "fallback", judgements: [] }),
};

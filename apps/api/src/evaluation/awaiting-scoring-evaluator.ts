/**
 * The interim `JobEvaluator` until ticket 08 wires in the keyword matcher (and
 * ticket 09 the AI client): it judges no criteria. It still sits at the
 * evaluator seam, so the Run's AI-evaluation cap, Seen marking and statuses
 * behave as they will once real judgements arrive.
 */
import type { JobEvaluator } from "../pipeline/ports.js";

export const awaitingScoringEvaluator: JobEvaluator = {
  evaluate: async () => [],
};

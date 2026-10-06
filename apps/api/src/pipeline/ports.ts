/**
 * The pipeline's outward-facing ports (CLAUDE.md, Flow 6). The pipeline depends
 * only on these and on the `Repo`; adapters and test fakes implement them, and
 * `buildPipeline` receives them. The submitter port joins with its ticket.
 */
import type { Ats, FitCriterion, Posting, ScoredBy } from "@auto-apply/shared";

/** One public job board on one ATS, e.g. Greenhouse `stripe` (D2). */
export interface BoardRef {
  ats: Ats;
  board: string;
}

/**
 * One ATS's discovery adapter (spec, Discovery & ATS adapters): GET-only reads
 * of a public board, normalised into Postings labelled `live`. Throws when the
 * board cannot be read; the caller decides what to fall back to (D3). Only the
 * Greenhouse adapter exists (2026-10-06 time cut); Lever and Ashby would be
 * further implementations of this port.
 */
export interface JobSource {
  readonly ats: Ats;
  discover(board: string): Promise<Posting[]>;
}

/**
 * What the pipeline asks for: every Posting to consider in this Run, across
 * all boards. Never throws for a single failed board; that board falls back to
 * its recorded fixtures, labelled (D3).
 */
export interface Discovery {
  discover(): Promise<Posting[]>;
}

/** One soft criterion judged against a Posting: met or not, with a quote as evidence (D7). */
export interface CriterionJudgement {
  criterionId: string;
  met: boolean;
  /** A quote from the Posting supporting the judgement. */
  evidence: string;
}

/** A `JobEvaluator`'s answer: its judgements, and who made them (D24). */
export interface EvaluatorResult {
  /** `fallback` when the keyword matcher judged instead of the AI. */
  scoredBy: ScoredBy;
  judgements: CriterionJudgement[];
}

/**
 * Judges a Posting that passed screening against the rubric's AI-side criteria
 * (D7): per-criterion evidence only — no score, no Verdict; code computes
 * those (`evaluation/score.ts`). Judgements for criteria it was not asked
 * about are ignored, and a criterion it leaves out counts as not met. Every
 * call counts against the Run's AI-evaluation cap (D17), so the pipeline calls
 * it at most once per Posting per Run. The keyword fallback matcher (ticket
 * 08) and the AI client (ticket 09) implement it.
 */
export interface JobEvaluator {
  evaluate(posting: Posting, criteria: readonly FitCriterion[]): Promise<EvaluatorResult>;
}

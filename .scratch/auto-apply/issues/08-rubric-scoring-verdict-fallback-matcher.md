# 08: Rubric + scorer + verdict banding + keyword fallback matcher

**What to build:** Postings that survive the hard blocks get scored into a Verdict. Until the AI client lands (ticket 09), the judgements come from a keyword matcher, so the whole Run already produces real `APPLY NOW` / `APPLY` / `STRETCH` outcomes with reasons, streamed live.

**Blocked by:** 07.

**Status:** done

- [ ] A static weighted rubric is derived from preferences (D6): a list of criteria, each with id, label, weight, and whether it is code-judged or AI-judged. The code/AI split is by **reliability** — code judges only what it can parse and compute properly (tier, remote, location, comp if present); judgement over prose is AI-judged. (Optimisation/correctness, not token-saving.)
- [ ] A `JobEvaluator` returns, per AI-judged criterion, `{ met: boolean, evidence: string }` (a quote) — no scores, no verdict.
- [ ] The **keyword matcher** implements that same `{met, evidence}` contract (evidence = matched snippet) and is wired in as the evaluator for the whole Run (no AI client yet).
- [ ] Code multiplies met criteria by weights, sums, and maps the total onto the D8 bands; thresholds are named constants in the contract. Verdict drives action: `APPLY NOW` → will fill+submit; `APPLY` → `held:below_auto_threshold`; `STRETCH` and below → `skipped:stretch`.
- [ ] Table-driven unit tests for scoring and band→Verdict; pipeline-seam tests for the end-to-end verdict outcomes streaming live.

## Log
- 2026-10-06 /run-tickets: merged branch ticket-08 (`9e66c39`). Rubric `apps/api/src/evaluation/rubric.ts` from `preferences.fitCriteria` (code judges only the title tier; rest → `JobEvaluator`); scorer `score.ts` (sum met weights, highest-only per group, clamp to `FIT_CAP`, `verdictFor` → D8 bands); keyword matcher `keyword-matcher.ts` implements `JobEvaluator` (whole-word, verbatim ≤160-char snippet). Port now returns `{scoredBy, judgements}`. Outcomes: APPLY → `held: below_auto_threshold`; STRETCH → `skipped: stretch`; APPLY NOW → interim `held: AWAITING_SUBMIT_REASON` until 10/11; hard blocks carry the `BLOCKED` verdict. Live table shows "fallback scoring". Tests added: `score.test.ts`, `keyword-matcher.test.ts`, 6 pipeline-seam tests, repo-contract + `contract.test.ts` (pre-08 defaults) + `EvaluationsTable.test.tsx` additions. Contract (additive): `HELD_REASONS`, `FIT_CAP=10`, `APPLY_NOW_MIN_FIT=7`, `APPLY_MIN_FIT=5`, `judgedBySchema`, `scoredBySchema`, `criterionEvidenceSchema`, `evaluation.evidence` (default []), `evaluation.scoredBy` (default null); `EvaluationDelta` in `packages/shared/src/repo.ts` gained `evidence?`/`scoredBy?`.
- Decisions: any met penalty criterion is a "gap" (score ≥7 with a gap → APPLY); keyword matcher has no terms for experience band / partial stack / the two penalties (never met under fallback); language gate not built (follow-up). Fixtures-only run: 88 discovered / 79 blocked / 9 evaluated → 2 APPLY NOW, 1 APPLY, 6 STRETCH. Pending human approval: delete the now-unused `apps/api/src/evaluation/awaiting-scoring-evaluator.ts`. Browser check pending.

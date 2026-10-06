# 07: Seen-skip + hard blocks + transition table + limits

**What to build:** The cheap, deterministic front of evaluation: already-Seen Postings are skipped before any spend, disqualifying facts hard-block in code with a reason, every status change goes through one validated transition, and the Run honours its concurrency and evaluation caps.

**Blocked by:** 04, 06.

**Status:** done

Status + reason shape (from grilling, trimmed): `blocked:<reason>`, `skipped:'seen'|'stretch'|'limit'`, `held:'needs_you'`, `failed:'simulated'|'interrupted'|<reason>`.

- [x] Seen dedupe: a Posting evaluated in any earlier Run is `skipped:seen` before any hard block or AI call (D15); a second Run looks visibly different.
- [x] Hard blocks are pure predicates over `Posting` + preferences (location/remote, visa, etc.), run first; any failure short-circuits to `blocked:<reason>` and spends no AI tokens.
- [x] A centralised transition table per machine (pure functions) validates every Run and Evaluation status change and throws on an illegal move; the only backward edge (Retry) is added later in ticket 11.
- [x] Limits: a tiny inline semaphore enforces `MAX_IN_FLIGHT = 3`; a per-Run counter gates AI calls to `MAX_AI_EVALS = 15` (seen-skips and hard-blocks don't count). Once the cap is hit the pipeline stops pulling further Postings; unpulled Postings are not persisted.
- [x] Table-driven unit tests for hard blocks and the transition table; pipeline-seam tests for seen-skip and limits.

## Log
- 2026-10-06 /run-tickets: merged branch ticket-07 (final `fde665a`). Hard blocks are pure predicates in `apps/api/src/evaluation/screen.ts` (location/remote incl. relocation check, company category, employment type, role family, AI-strategy consulting, team size, experience minimum, INR salary floor only when `SALARY_FLOOR_LPA` set); `company_size` and `staffing_blocked_client` left to the rubric. Transition table `apps/api/src/pipeline/transitions.ts` (pure, throws `IllegalTransitionError`, no Retry edge yet — ticket 11). Limits: 3-worker pool + per-Run 15-slot AI counter; unpulled Postings not persisted; at most 2 `skipped: limit` per Run. Tests added: `transitions.test.ts` (every from→to pair), `screen.test.ts` (table-driven over seed preferences), 7 pipeline-seam tests, `EvaluationsTable.test.tsx`. Contract (additive): `SKIP_REASONS = {seen, limit, stretch}` + `SkipReason`.
- Interim until 08: `JobEvaluator` port (`evaluate(posting, criteria) → {criterionId, met, evidence}[]`); wired `awaitingScoringEvaluator` returns `[]`, so screened Postings end `skipped: "Passed screening; scoring is not built yet"`.
- Decisions: excluded titles skipped in code without using an AI slot ("-only" terms left to the rubric); `funnel.discovered` = all discovered, `funnel.evaluated` = evaluator calls only; Evaluations written when pulled, not at discovery; `MAX_POSTINGS_PER_BOARD = 10` kept (most Postings block on location for this India-based user — without the cap a Run writes thousands of blocked Evaluations).
- Surprising: recorded boards give Run 1 = 88 discovered / 57 blocked / 15 evaluated; Run 2 = 72 seen-skipped. Seen keys written in `dev` by the interim evaluator will skip those Postings in later dev runs even after 08 — clear the `dev` namespace's `seen` before demoing. RunPanel progress bar divides by `discovered`, so it only hits 100% on completion. Browser check pending.
- 2026-10-06 final audit + fix pass (merged `e7aee7e` via fix-pass): audit found `company_size` and `staffing_blocked_client` enforced nowhere; the fix pass enforces both in code in `screen.ts`: staffing blocks only when the posting looks like an agency AND names a blocked company; size blocks only on a stated 10,000+ headcount or an already-blocked company, never the listed product companies. Author's null rule applied throughout: anything not stated is never a reason to block. Terms of ≤2 letters (EY, Go, AI, QA) match exact case only. `LIMITS` is now read by the pipeline.

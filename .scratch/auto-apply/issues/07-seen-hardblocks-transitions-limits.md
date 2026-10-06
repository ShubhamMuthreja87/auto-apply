# 07: Seen-skip + hard blocks + transition table + limits

**What to build:** The cheap, deterministic front of evaluation: already-Seen Postings are skipped before any spend, disqualifying facts hard-block in code with a reason, every status change goes through one validated transition, and the Run honours its concurrency and evaluation caps.

**Blocked by:** 04, 06.

**Status:** ready-for-agent

Status + reason shape (from grilling, trimmed): `blocked:<reason>`, `skipped:'seen'|'stretch'|'limit'`, `held:'needs_you'`, `failed:'simulated'|'interrupted'|<reason>`.

- [ ] Seen dedupe: a Posting evaluated in any earlier Run is `skipped:seen` before any hard block or AI call (D15); a second Run looks visibly different.
- [ ] Hard blocks are pure predicates over `Posting` + preferences (location/remote, visa, etc.), run first; any failure short-circuits to `blocked:<reason>` and spends no AI tokens.
- [ ] A centralised transition table per machine (pure functions) validates every Run and Evaluation status change and throws on an illegal move; the only backward edge (Retry) is added later in ticket 11.
- [ ] Limits: a tiny inline semaphore enforces `MAX_IN_FLIGHT = 3`; a per-Run counter gates AI calls to `MAX_AI_EVALS = 15` (seen-skips and hard-blocks don't count). Once the cap is hit the pipeline stops pulling further Postings; unpulled Postings are not persisted.
- [ ] Table-driven unit tests for hard blocks and the transition table; pipeline-seam tests for seen-skip and limits.

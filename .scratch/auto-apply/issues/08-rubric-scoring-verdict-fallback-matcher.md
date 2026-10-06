# 08: Rubric + scorer + verdict banding + keyword fallback matcher

**What to build:** Postings that survive the hard blocks get scored into a Verdict. Until the AI client lands (ticket 09), the judgements come from a keyword matcher, so the whole Run already produces real `APPLY NOW` / `APPLY` / `STRETCH` outcomes with reasons, streamed live.

**Blocked by:** 07.

**Status:** ready-for-agent

- [ ] A static weighted rubric is derived from preferences (D6): a list of criteria, each with id, label, weight, and whether it is code-judged or AI-judged. The code/AI split is by **reliability** — code judges only what it can parse and compute properly (tier, remote, location, comp if present); judgement over prose is AI-judged. (Optimisation/correctness, not token-saving.)
- [ ] A `JobEvaluator` returns, per AI-judged criterion, `{ met: boolean, evidence: string }` (a quote) — no scores, no verdict.
- [ ] The **keyword matcher** implements that same `{met, evidence}` contract (evidence = matched snippet) and is wired in as the evaluator for the whole Run (no AI client yet).
- [ ] Code multiplies met criteria by weights, sums, and maps the total onto the D8 bands; thresholds are named constants in the contract. Verdict drives action: `APPLY NOW` → will fill+submit; `APPLY` → `held:below_auto_threshold`; `STRETCH` and below → `skipped:stretch`.
- [ ] Table-driven unit tests for scoring and band→Verdict; pipeline-seam tests for the end-to-end verdict outcomes streaming live.

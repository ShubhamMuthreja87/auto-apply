# 06: ATS discovery adapters + Posting normalisation + D3 fallback fixtures

**What to build:** Real jobs. The pipeline discovers Postings from the public Greenhouse, Lever and Ashby boards and streams them as queued Evaluations; a board that fails falls back to that board's recorded fixtures, labelled.

**Blocked by:** 05.

**Status:** done

- [x] `JobSource { readonly ats; discover(board): Promise<Posting[]> }`, one adapter per ATS, plain `fetch` with an `AbortController` timeout, **GET only**, never a write to an ATS endpoint.
- [x] A registry maps ~15 hardcoded boards to their adapter (Greenhouse always `content=true`).
- [x] `Posting` normalises to `{ ats, board, jobId, title, company, location, descriptionText, applyUrl }` plus a parsed `remote` boolean; HTML stripped to text.
- [x] A failed board falls back to that board's fixtures, labelled as fallback (D3); the run continues.
- [x] **Adapter seam** tests: each discovery adapter is driven by an injected `fetch` returning **recorded real responses**; the same recordings are the per-board fallback fixtures.
- [x] The skeleton pipeline's discovery step is replaced by real discovery; Postings appear as queued Evaluations in the live view.

## Log
- 2026-10-06 /run-tickets: merged `8180288` (+ merge `3135dde`, branch ticket-06). Scope per the time cut: Greenhouse adapter only. Board registry `apps/api/src/discovery/boards.ts`: 15 real Greenhouse boards (all 200). Fixtures `apps/api/fixtures/greenhouse/boards/*.json` (real recordings, trimmed to ≤6 jobs/board, values untouched) + Stripe/Anthropic `?questions=true` forms for ticket 10. Tests added: normalise (htmlToText, isRemote), greenhouse adapter (injected fetch, GET-only, HTTP error, bad shape, timeout), discovery (live/fallback/no adapter/no fixture/cap/fixtures mode), pipeline over recordings with one failing board, config, web Fallback/Fixture chip. Contract (additive, approved): `postingSourceSchema` (`live|fallback|fixture`), `posting.remote` (default false), `posting.source` (default "live"); repo validate helpers widened for zod defaults. Decisions: `MAX_POSTINGS_PER_BOARD = 10` (newest first) until ticket 07 limits arrive; `JOB_SOURCE=fixtures` env flag for deterministic runs (label `fixture`). Surprising: a live run is ~75 s (150 jobs × 500 ms skeleton delay) until 07. Pending human approval: delete the now-unused `apps/api/src/pipeline/skeleton-job-source.ts` (file deletion is gated). Browser check pending.
- 2026-10-06 final audit + fix pass (merged `e7aee7e` via fix-pass): all bullets verified (Greenhouse only, per the time cut). Correction: `skeleton-job-source.ts` was deleted in `2f0e970` (author approved). Fix pass: Greenhouse jobs are now parsed one by one and leniently — a null/missing `location`, `content` etc. becomes empty, only a job without id or title is skipped (logged), so one partial job can no longer push a whole board onto fallback; adapter test with null location/content added.

# 06: ATS discovery adapters + Posting normalisation + D3 fallback fixtures

**What to build:** Real jobs. The pipeline discovers Postings from the public Greenhouse, Lever and Ashby boards and streams them as queued Evaluations; a board that fails falls back to that board's recorded fixtures, labelled.

**Blocked by:** 05.

**Status:** ready-for-agent

- [ ] `JobSource { readonly ats; discover(board): Promise<Posting[]> }`, one adapter per ATS, plain `fetch` with an `AbortController` timeout, **GET only**, never a write to an ATS endpoint.
- [ ] A registry maps ~15 hardcoded boards to their adapter (Greenhouse always `content=true`).
- [ ] `Posting` normalises to `{ ats, board, jobId, title, company, location, descriptionText, applyUrl }` plus a parsed `remote` boolean; HTML stripped to text.
- [ ] A failed board falls back to that board's fixtures, labelled as fallback (D3); the run continues.
- [ ] **Adapter seam** tests: each discovery adapter is driven by an injected `fetch` returning **recorded real responses**; the same recordings are the per-board fallback fixtures.
- [ ] The skeleton pipeline's discovery step is replaced by real discovery; Postings appear as queued Evaluations in the live view.

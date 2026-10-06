# 10: Greenhouse form merge + field resolution + needs_you

**What to build:** For `APPLY NOW` jobs on Greenhouse, the real application form is fetched, all its question groups merged, and every field resolved from exactly one source — or the job is honestly held for the user.

**Blocked by:** 08.

**Status:** done

Normalised field (from grilling): `Field = { id, label, type: text|textarea|select|multiselect|file|boolean, required, options? }`.

- [ ] A `GreenhouseForms.fetchSchema(jobId)` capability (separate from `JobSource`) fetches the form, hosted URL with embed URL fallback (D5), GET only.
- [ ] Merge `questions`, `location_questions`, `education`, and `compliance/demographic_questions` into normalised `Field`s.
- [ ] A pure resolver classifies each field to one of four sources, in order: (1) API compliance/demographic/legal group → **user-only** (never auto, D10); (2) label/id → **profile/settings** map for standard fields, filled in code (name/contact stay in code, never the model); (3) remaining free-text/essay → **AI**; (4) anything left → **user-only**. Returns `{field, source, value?}[]` feeding both the payload builder and the missing-fields list.
- [ ] Any **required** field resolving without a value → the Evaluation is `held:needs_you` listing those fields (D11).
- [ ] **Adapter seam** tests include the recorded **Stripe** form (School/Degree outside `questions`) and **Anthropic** form (AI-policy acknowledgement + arbitration agreement held as user-only). Field resolution unit-tested table-driven.

## Log
- 2026-10-06 /run-tickets: first attempt (branch ticket-10) was stopped by an interruption; the author chose a clean restart. Merged branch ticket-10b (`d841266`). `GreenhouseForms.fetchSchema({board, jobId})` in `apps/api/src/forms/greenhouse-forms.ts` (GET only, timeout, recorded-form fallback labelled `fallback`); merge of questions/location_questions/education (expanded to School/Degree/Discipline)/compliance+demographic, lat/long hidden fields dropped; hosted URL when on greenhouse.io else embed URL. Pure resolver `apps/api/src/forms/resolve.ts` (one source per field in spec order; legal/AI-policy/consent/demographic/compensation → user; recognised-but-empty → user; unruled personal details never to the model). `FreeTextAnswerer` port, real adapter `apps/api/src/ai/free-text-answerer.ts` (untrusted delimiting; facts from `forms/candidate-facts.ts` with name/contact/links/location redacted; answer must cite given fact ids). Outcomes: unresolved required → `held: needs_you` + `missingFields`; complete → interim `held: FORM_READY_REASON` for ticket 11 (build payload from `fillForm(...).resolutions`; not stored yet). Web: `MissingFieldsList` in live table + Scanned jobs. Tests added: `greenhouse-forms.test.ts` (11), `resolve.test.ts` (39), `free-text-answerer.test.ts` (6), 8 pipeline, 2 EvaluationsTable. New recordings: `fixtures/greenhouse/forms/cloudflare-8099000.json`, `cloudflare-7653558.json`. Contract (additive): `missingFieldSchema`/`MissingField`, `evaluation.missingFields` (default []); `EvaluationDelta.missingFields?` in `repo.ts`.
- Decisions: AI asked only for required free text, and not when another required field already needs the user; free-text calls don't count against the 15 cap (≤1 per APPLY NOW job); unreadable form → job `failed` with reason, verdict kept; EM vs Staff framing from whether `title_manager` scored; School/Degree sent as text, not Greenhouse ids.
- Surprising: in fixtures mode both APPLY NOW postings (Cloudflare 8099000, 7653558) end `needs_you` (Resume/CV — `documents.resumeUrl` is null — plus a privacy-policy acknowledgement), so nothing reaches form-ready for the D19 demo without a decision. `prettier --check` reports 14 unformatted files on the tip (pre-existing; for code review). Browser check pending.

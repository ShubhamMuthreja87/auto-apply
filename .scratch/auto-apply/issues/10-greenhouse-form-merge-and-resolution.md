# 10: Greenhouse form merge + field resolution + needs_you

**What to build:** For `APPLY NOW` jobs on Greenhouse, the real application form is fetched, all its question groups merged, and every field resolved from exactly one source — or the job is honestly held for the user.

**Blocked by:** 08.

**Status:** ready-for-agent

Normalised field (from grilling): `Field = { id, label, type: text|textarea|select|multiselect|file|boolean, required, options? }`.

- [ ] A `GreenhouseForms.fetchSchema(jobId)` capability (separate from `JobSource`) fetches the form, hosted URL with embed URL fallback (D5), GET only.
- [ ] Merge `questions`, `location_questions`, `education`, and `compliance/demographic_questions` into normalised `Field`s.
- [ ] A pure resolver classifies each field to one of four sources, in order: (1) API compliance/demographic/legal group → **user-only** (never auto, D10); (2) label/id → **profile/settings** map for standard fields, filled in code (name/contact stay in code, never the model); (3) remaining free-text/essay → **AI**; (4) anything left → **user-only**. Returns `{field, source, value?}[]` feeding both the payload builder and the missing-fields list.
- [ ] Any **required** field resolving without a value → the Evaluation is `held:needs_you` listing those fields (D11).
- [ ] **Adapter seam** tests include the recorded **Stripe** form (School/Degree outside `questions`) and **Anthropic** form (AI-policy acknowledgement + arbitration agreement held as user-only). Field resolution unit-tested table-driven.

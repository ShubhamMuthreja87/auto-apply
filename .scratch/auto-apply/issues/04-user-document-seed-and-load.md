# 04: User document — seed on first boot + load

**What to build:** The user's profile, preferences and application settings (D13) persisted in Firebase and loaded by the pipeline. On first boot the user document is seeded from a real profile so a fresh checkout works; everything downstream (hard blocks, rubric, field resolution) reads from it.

**Blocked by:** 03.

**Status:** done

- [ ] A single user document holds profile, preferences (the rubric/hard-block inputs from D6), and application settings.
- [ ] `seedUserIfMissing` writes the seed profile on first boot only; editing later never re-seeds. The seed is real data (the author's), structured to match what the rubric and field resolver consume.
- [ ] `getUser` loads the document; the pipeline composition root receives it (no module reads Firestore directly).
- [ ] Preferences and settings are validated with zod on read.
- [ ] Demonstrable: a fresh namespace boots with a populated user document stored in Firebase, readable via the API.
## Seed source (added by the author)
- Build the seed only from `seed/source/resume.md`, `seed/source/job-search-prompt.md` and `seed/source/application-settings.md`.
- Never invent a fact. Anything a field needs that the sources don't state stays empty and resolves to user-only; list those fields in this ticket's Log.
- Compensation and salary fields are always user-only and never seeded.
- The rubric and preferences come from the job-search prompt (D6); keep its criteria and weights traceable to the original wording.
The salary floor comes from optional env SALARY_FLOOR_LPA; if unset, the salary hard block is inactive.
## Log
- 2026-10-06 /run-tickets: merged branch ticket-04 (final `19d6171`). Seed `apps/api/src/seed-user.ts` built only from `seed/source/*`; `seedUser` writes only if missing; `loadUser` validates with the contract `userSchema`; pipeline gets a `loadUser(uid)` dep and loads per run; `GET /api/me`. Demoed on a fresh `test-demo04a` namespace against real Firestore, then deleted. Tests added: `user.test.ts` (seed/load; every rubric `source` quote verbatim in the prompt; weights; no salary keys), `me.test.ts` (200/404/500), 2 pipeline tests, `SALARY_FLOOR_LPA` config tests, 1 Firestore round-trip. Contract (additive): `experienceEntrySchema`, `userProfileSchema`, `fitCriterionSchema`, `hardBlockRuleSchema`, `languageGateRuleSchema`, `userPreferencesSchema`, `applicationSettingsSchema`, `userSchema`, `meResponseSchema`; `userDocSchema` unchanged.
- Left empty / user-only: `settings.location.postalAddress`, `settings.location.citizenship`, `settings.documents.resumeUrl`, `settings.documents.coverLetter`; compensation not in the schema at all (listed in `settings.alwaysUserOnly` with legal, AI-policy, consent, demographic). Salary hard block `threshold: null`; floor from optional env `SALARY_FLOOR_LPA`.
- Author to confirm: start date "1/11/26" read day-first → `2026-11-01`; prompt says "Available immediately" but settings say "Notice period: 30 days" — settings value (30) used for forms; "Linkedin" normalised to "LinkedIn"; https contact URLs taken from settings. Fit criteria use a nullable `group` ("title", "stack") to encode the prompt's "highest only"/"else" rules.
- 2026-10-06 author confirmed: start date 2026-11-01, notice period 30 days (settings value wins over "Available immediately"), "LinkedIn" spelling fix OK, contact links from settings OK. No code change needed — the seed already uses these.

# 04: User document — seed on first boot + load

**What to build:** The user's profile, preferences and application settings (D13) persisted in Firebase and loaded by the pipeline. On first boot the user document is seeded from a real profile so a fresh checkout works; everything downstream (hard blocks, rubric, field resolution) reads from it.

**Blocked by:** 03.

**Status:** ready-for-agent

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
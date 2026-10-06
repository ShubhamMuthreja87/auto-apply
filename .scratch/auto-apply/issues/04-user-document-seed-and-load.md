# 04: User document — seed on first boot + load

**What to build:** The user's profile, preferences and application settings (D13) persisted in Firebase and loaded by the pipeline. On first boot the user document is seeded from a real profile so a fresh checkout works; everything downstream (hard blocks, rubric, field resolution) reads from it.

**Blocked by:** 03.

**Status:** ready-for-agent

- [ ] A single user document holds profile, preferences (the rubric/hard-block inputs from D6), and application settings.
- [ ] `seedUserIfMissing` writes the seed profile on first boot only; editing later never re-seeds. The seed is real data (the author's), structured to match what the rubric and field resolver consume.
- [ ] `getUser` loads the document; the pipeline composition root receives it (no module reads Firestore directly).
- [ ] Preferences and settings are validated with zod on read.
- [ ] Demonstrable: a fresh namespace boots with a populated user document stored in Firebase, readable via the API.

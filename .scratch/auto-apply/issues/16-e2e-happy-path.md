# 16: E2E Playwright happy path (deterministic mode)

**What to build:** One end-to-end test that drives the real app through the button → live stream → submitted (simulated) path, reproducibly, without touching the network or an AI provider. (Cuttable.)

**Blocked by:** 11, 14.

**Status:** ready-for-agent

- [ ] A **deterministic mode** selected by an env flag: a fixtures-only job source (no real ATS calls) and **no AI key**, so the Run uses fallback scoring throughout.
- [ ] One Playwright spec: start the app in deterministic mode, press Auto-apply, observe the Run stream through its statuses, and reach at least one `submitted (simulated)` Evaluation (including the first-fail → Retry path).
- [ ] If auth (ticket 15) is present, the spec logs in first; otherwise it goes straight to the button.
- [ ] `npm run test:e2e` runs it green and repeatably.

# 16: E2E Playwright happy path (deterministic mode)

**What to build:** One end-to-end test that drives the real app through the button → live stream → submitted (simulated) path, reproducibly, without touching the network or an AI provider. (Cuttable.)

**Blocked by:** 11, 14.

**Status:** done

- [ ] A **deterministic mode** selected by an env flag: a fixtures-only job source (no real ATS calls) and **no AI key**, so the Run uses fallback scoring throughout.
- [ ] One Playwright spec: start the app in deterministic mode, press Auto-apply, observe the Run stream through its statuses, and reach at least one `submitted (simulated)` Evaluation (including the first-fail → Retry path).
- [ ] If auth (ticket 15) is present, the spec logs in first; otherwise it goes straight to the button.
- [ ] `npm run test:e2e` runs it green and repeatably.

## Log
- 2026-10-06 /run-tickets: merged branch ticket-16 (`504afed`). The author approved running Playwright in the cloud session against the preinstalled Chromium (no download). `npm run test:e2e` = `playwright test` (not part of `verify`). `playwright.config.ts` starts two webServers: the API from source (`tsx src/index.ts`, no `--env-file`, `REPO=memory`, `JOB_SOURCE=fixtures`, `FIRESTORE_NAMESPACE=test-e2e`, `NODE_ENV=test`, AI key and Firebase credentials forced empty) and the Vite dev server (`--strictPort`, same-origin via the proxy, so the `Secure` cookie works on http://localhost); `reuseExistingServer: false`. Spec `e2e/happy-path.spec.ts`: login → Auto-apply → active status + disabled button → "Fallback scoring" → Completed → "Demo Co (synthetic)" shows "Simulated failure (demo)" → Applied jobs → Retry → "Submitted (simulated)", attempt 2. `e2e/credentials.ts`: fixed non-secret e2e-only login (cost-12 hash at config load), random `JWT_SECRET` per run. Optional `E2E_CHROMIUM_PATH` (Playwright 1.63 wants Chromium build 1243; `/opt/pw-browsers` has 1194). Results: 7/7 green by the implementer, 1/1 green by the orchestrator after merge (~25 s; ~17.6 s of it the pipeline's simulated delays). Completed assertion waits up to 60 s.

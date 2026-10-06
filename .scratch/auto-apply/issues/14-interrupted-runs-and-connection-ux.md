# 14: Interrupted-run recovery + connection-state & empty/error UX + double-click guard

**What to build:** The live view never lies. A Run killed by a restart shows as failed rather than hanging; the stream's connection state is always visible; lists handle empty/error; and the button can't start two Runs. (Cuttable polish on top of the core live view.)

**Blocked by:** 05 ,05b .

**Status:** done

- [x] On startup the API marks any Run still `running` from before boot as `failed:interrupted`, so the UI never shows a Run stuck forever.
- [x] The `useRunStream` hook surfaces connection state: connecting / live / reconnecting / closed; the view reflects it.
- [x] The Auto-apply button is disabled while a Run is active (client), complementing the server's 409.
- [x] Run and list views render loading, empty and error states, not just the happy path.
- [x] Component-seam tests (RTL, fake `EventSource`) cover the connection states and the interrupted-run display.
Build the UI with the 05b shell, theme and StatusChip; tables use MUI Table; no ad-hoc styling.

## Log
- 2026-10-06 /run-tickets: merged `bb310dd` (branch ticket-14). Tests added: `apps/api/src/runs/recover-interrupted-runs.test.ts` (5), 5 new cases in `apps/web/src/run/RunPanel.test.tsx` (interrupted after reconnect, gave up before snapshot, gave up mid-run, active-run lookup failure, double click). Contract: added constant `RUN_INTERRUPTED_REASON = "interrupted"` (additive, approved for this run). Surprising: recovery uses `getActiveRun(DEMO_UID)` (single user) instead of a new list-active-runs port method; a fresh page load after a restart shows "No runs yet" rather than the interrupted run because no "latest run" endpoint exists yet. Browser check pending.
- 2026-10-06 final audit + fix pass (merged `e7aee7e` via fix-pass): fix pass: Home now shows the latest Run when none is active (via `GET /api/runs`), including an interrupted one; an interrupted Run's unfinished jobs are failed as interrupted (earlier follow-up, `277769d`).

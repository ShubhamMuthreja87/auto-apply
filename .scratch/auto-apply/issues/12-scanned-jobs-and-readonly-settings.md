# 12: Scanned jobs view + read-only Settings page

**What to build:** The reference views over data already stored: everything that was evaluated and why, and a read-only look at the profile/preferences/settings that drive matching.

**Blocked by:** 04, 08 , 05b.

**Status:** done

- [x] Web **Scanned jobs** view lists every Evaluation (across Runs or for a selected Run) with its Verdict, status, reason, `scoredBy` label, and per-criterion evidence. Renders loading/empty/error states.
- [x] Web **Settings** page displays the user document — profile, preferences, application settings — **read-only** (editing is ticket 17).
- [x] Both views read only from stored data via the API; the browser never touches Firebase.
- [x] Component-seam tests (RTL) for the Scanned list and the read-only Settings render, including empty and error states.
Build the UI with the 05b shell, theme and StatusChip; tables use MUI Table; no ad-hoc styling.

## Log
- 2026-10-06 /run-tickets: merged branch ticket-12 (`9331a61`). Scanned jobs `/scanned` (`apps/web/src/pages/ScannedJobsPage.tsx`): all Evaluations or one Run, verdict/score/fallback label/status/reason, expandable per-criterion evidence. Read-only Settings `/settings` (`SettingsPage.tsx`) from `GET /api/me`; null settings read "Not set · you answer this"; `alwaysUserOnly` as chips. New endpoints `GET /api/runs`, `GET /api/evaluations?runId=` (`apps/api/src/routes/scanned.ts`); Repo port gained `listRuns(uid)`, `listEvaluations(runId)` on both adapters + shared repo contract suite (Firestore sorts in code, no composite index). Tests added: 2 repo-contract cases, `scanned.test.ts` (7), `ScannedJobsPage.test.tsx` (6), `SettingsPage.test.tsx` (6), 2 `App.test.tsx` routes. Contract (additive): `runsListResponseSchema`, `evaluationsListResponseSchema`. Decisions: "all runs" = one `listEvaluations` per Run (prototype scale); missing user doc → empty state; shared cells moved to `apps/web/src/run/evaluationCells.tsx`; small `useLoad` hook. Surprising: an `App.test.tsx` footer-error assertion was scoped to the footer because Settings now shows its own alert too. Post-merge verify initially failed only because `eslint .` linted the implementer worktrees; fixed by ignoring `.claude/worktrees/**` (author chose this). Browser check pending.
- 2026-10-06 final audit + fix pass (merged `e7aee7e` via fix-pass): all bullets verified. The read-only Settings page was superseded by ticket 17 (editable), as planned.

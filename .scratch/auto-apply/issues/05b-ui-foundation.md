# 05b: UI foundation (theme, shell, StatusChip, Run view redesign)

**What to build:** a designed, minimal UI foundation that every later view uses.

**Blocked by:** 05.

**Status:** done

- [x] Add MUI (@mui/material, @emotion/react, @emotion/styled, @mui/icons-material) and @fontsource/inter (self-hosted font, no external requests) to the dependency ADR. This is a dependency change, so ask me first.
- [x] Theme: Inter, a neutral light background, one primary colour, 8px spacing, rounded cards, restrained shadows.
- [x] Shell: an app bar with the product name "AI Auto-apply", a small "Prototype" badge and nav tabs (Run, Applied jobs, Scanned jobs, Settings); a max-width content container; a quiet footer ("Submissions are simulated · payloads are built and stored, never sent").
- [x] One shared StatusChip used everywhere, always colour plus text (never colour alone): discovering/evaluating/applying = info with a spinner; queued = default; submitted (simulated) = success with a "simulated" tag; held/needs_you = warning; skipped = neutral; blocked = muted error; failed = error. Verdict chips: APPLY NOW, APPLY, STRETCH.
- [x] Run view redesign: a header card with the Auto-apply button, run status and a linear progress bar; funnel counts as a row of stat cards; jobs as a table (company, role, source, verdict, score, status, reason) whose rows update live; a connection indicator (live / reconnecting / closed); a proper empty state before the first run.
- [x] Keep the existing tests green and update the RTL tests for the new markup.

## Notes (implementation)

Human-approved during implementation:

- All five UI packages added to ADR-0002 under `apps/web`.
- Nav tabs are real routes with `react-router-dom` (already on ADR-0002): `/`, `/applied`, `/scanned`, `/settings`. Unknown paths redirect to `/`. Applied jobs, Scanned jobs and Settings show an honest "Not built yet" placeholder until tickets 11 and 12 replace them.

Choices made:

- `App` renders the theme and routes; the router comes from the caller (`BrowserRouter` in `main.tsx`, `MemoryRouter` in tests).
- The API health line (namespace, in-memory vs Firestore, ADR-0004) moved from the Run page into the footer.
- The progress bar is indeterminate while discovering, then shows finished jobs (blocked + skipped + held + submitted + failed) / discovered, and is full at a terminal status.
- `held` reads "Needs you". `BLOCKED` also gets a verdict chip (muted error), since the contract's Verdict includes it.
- `.playwright-mcp/` (browser-check screenshots) is gitignored.

For ticket 13: the routes are client-side, so nginx needs `try_files $uri /index.html` so that deep links like `/applied` load on refresh.

## Log
- Built in `a9a6294` before this run. 2026-10-06 audit: all bullets verified; the placeholders it introduced were replaced by tickets 11, 12 and 17, and `PlaceholderPage.tsx` was deleted with the author's approval.

# 12: Scanned jobs view + read-only Settings page

**What to build:** The reference views over data already stored: everything that was evaluated and why, and a read-only look at the profile/preferences/settings that drive matching.

**Blocked by:** 04, 08 , 05b.

**Status:** ready-for-agent

- [ ] Web **Scanned jobs** view lists every Evaluation (across Runs or for a selected Run) with its Verdict, status, reason, `scoredBy` label, and per-criterion evidence. Renders loading/empty/error states.
- [ ] Web **Settings** page displays the user document — profile, preferences, application settings — **read-only** (editing is ticket 17).
- [ ] Both views read only from stored data via the API; the browser never touches Firebase.
- [ ] Component-seam tests (RTL) for the Scanned list and the read-only Settings render, including empty and error states.
Build the UI with the 05b shell, theme and StatusChip; tables use MUI Table; no ad-hoc styling.

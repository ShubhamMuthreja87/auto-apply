# 11: Simulated submit + D19 first-fail/retry + Applied jobs view

**What to build:** Qualifying jobs get "submitted" — the real Greenhouse payload is built and stored but never sent — and the user can review each one. The first submit in a Run fails on purpose; Retry succeeds. An Applied jobs view lists submissions and shows each payload.

**Blocked by:** 10 , 05b .

**Status:** ready-for-agent

- [ ] `ApplicationSubmitter` builds the real Greenhouse payload with real field IDs, waits (injected `delay`), stores it, and **never sends it** — no POST to any employer/ATS endpoint (D18).
- [ ] The first submit per Run fails with `failed:simulated`; Retry is the one explicit backward edge in the transition table (D19) and rebuilds/shows the payload, then succeeds (`submitted`).
- [ ] UI labels it "Submitted (simulated)" with a banner; nothing is presented as a real application.
- [ ] Web **Applied jobs** view lists submitted (simulated) Evaluations with a "View payload" action and a working Retry on the failed one.
- [ ] Pipeline-seam tests assert first-fail-then-retry deterministically (fake `ApplicationSubmitter`, injected `delay` — no real sleep) and that the stored payload carries real field IDs.
Build the UI with the 05b shell, theme and StatusChip; tables use MUI Table; no ad-hoc styling.

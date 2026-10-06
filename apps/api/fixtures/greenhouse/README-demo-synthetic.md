# Synthetic demo fixtures (`demo-synthetic`)

`boards/demo-synthetic.json` and `forms/demo-synthetic-9000001.json` are **hand-made**, not recordings of a real Greenhouse board. They are shaped like the Greenhouse job-board API responses (`/jobs?content=true` and `/jobs/{id}?questions=true`) so the same adapters parse them.

Why they exist: in fixtures mode every real APPLY NOW posting ends `needs_you` (the seed has no resume URL, and the recorded forms ask for consent acknowledgements, which are user-only under D10). This one job lets the demo and the E2E test reach the simulated submit and the D19 fail-then-Retry path without inventing a resume or auto-answering consent.

- One job, "Demo Co (synthetic)", that the keyword matcher scores APPLY NOW with the seed preferences.
- Its form has only standard fields the seed profile and settings answer. No resume or file upload, and no consent, legal, AI-policy or demographic questions.
- Used only when `JOB_SOURCE=fixtures` (`boardsFor("fixtures")` in `src/discovery/boards.ts`) and in tests. It is never in the live board registry (`BOARDS`), so live runs never see it. In the UI it carries the usual "Fixture" label.

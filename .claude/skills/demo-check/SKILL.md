---
name: demo-check
description: Verify the auto-apply demo end to end in a real browser (button → API → Firestore → live SSE statuses), locally or against the deployed site. Use after a ticket that touches the UI or pipeline, before calling the prototype done, after a deploy, and to capture screenshots for the documents.
argument-hint: "Optional: a URL to check instead of localhost, e.g. https://your-domain"
---

If `CLAUDE_CODE_REMOTE` is `true`, stop: browser checks run on the developer's machine. Say so and suggest `claude --teleport`.

Target: the URL the user gave, else `http://localhost:5173`.

1. For localhost: if `http://localhost:5173` or `http://localhost:3001/api/health` don't respond, start `npm run dev` in the background and wait until both respond (give up after 90 seconds and report the error output).
2. Check the stream without a browser first: `POST /api/runs`, then `curl -sN <target>/api/runs/<runId>/events` for up to 60 seconds. Events must arrive one by one, not in one burst at the end (a burst means buffering is on somewhere).
3. Spawn the `e2e-tester` subagent (it keeps the browser's large page snapshots out of this context) with this flow:
   - open the target,
   - click the auto-apply button and check it is disabled while the run is active,
   - log in first if the login page appears (credentials from the user; never read `.env`),
   - watch until the run reaches `completed` or `failed` and every job reaches a final status (`blocked`, `skipped`, `held`, `submitted (simulated)` or `failed`), or 120 seconds pass,
   - confirm statuses changed live without a reload, funnel counts add up, every job shows a reason, and "Submitted (simulated)" is labelled as simulated,
   - confirm the deliberate first-submit failure shows Retry, and Retry succeeds (D19),
   - confirm the run's jobs then appear in Applied jobs and Scanned jobs,
   - if the user asked for screenshots, save initial, mid-run and final states to `docs/deliverables/assets/`.
4. Cross-check persistence through the API's own read endpoints (run detail, Applied jobs, Scanned jobs): confirm they match what the tester saw, and that a page reload shows the same state (it comes from Firestore, not memory). Check the API output for errors. Never read credentials or `.env` files to query Firestore directly.
5. Report PASS or FAIL with the status timeline, counts per final status, and any problems with their evidence. If FAIL, call the Skill tool with `diagnosing-bugs`.

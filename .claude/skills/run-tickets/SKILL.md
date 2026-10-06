---
name: run-tickets
description: Unattended execution of the approved tickets in .scratch/auto-apply/issues/, meant for a long cloud session. Wraps implement-spec with this project's guardrails, blocker handling and a final run report.
argument-hint: "Optional: which tickets, e.g. 03-07 (default: all open tickets)"
disable-model-invocation: true
---

You are running unattended. The human is busy elsewhere and will review your work afterwards. Prefer stopping a ticket and reporting over guessing.

## Preconditions (check all; if any fails, stop and say which)

- `.scratch/auto-apply/spec.md` exists and the tickets exist under `.scratch/auto-apply/issues/`.
- The scaffold and tracer-bullet tickets are `Status: done`, and `npm run verify` passes on the current branch.
- An ADR in `docs/adr/` lists the allowed dependencies.
- Firestore: if `FIREBASE_SERVICE_ACCOUNT_JSON` is not set, say so at the start and in the run report. The in-memory tests still run; the Firestore integration suite skips, and every ticket that touches the repository adapter gets "Firestore integration pending" in its log.

## Run

Call the Skill tool with `implement-spec`, using the current branch as the integration branch, the tickets the user named (or all open ones), and these project rules:

- **Implementers** build their ticket with `tdd` at the seams named in the spec, and `npm run verify` must pass before they report done.
- **Dependencies**: only those in the dependency ADR. Needing anything else is a blocker.
- **Contract**: if a ticket needs `packages/shared/src/contract.ts` to change, don't change it. Write the proposed change and the reason under `## Blocked` in the ticket, set `Status: blocked`, and move on to tickets that don't depend on it.
- **Fix attempts**: at most 2 attempts per failing ticket; then mark it blocked with the failing output as evidence. Use `diagnosing-bugs` for the attempts.
- **After each merge** into the integration branch: run `npm run verify`, set the ticket to `Status: done`, and append to its `## Log`: commit hash, tests added, anything surprising.
- **Browser checks**: if `CLAUDE_CODE_REMOTE` is `true`, skip Playwright and the `demo-check` skill (the browser may not be downloadable here). Note "browser check pending" in the ticket log.
- **Never**: deploy, touch the server, push to `main`, edit `deploy/`, use the `prod` Firestore namespace, send anything but GET requests to an ATS, put real API keys in code or logs, or weaken or skip a test to get green.

## Finish

1. Call the Skill tool with `code-review` against the commit you started from, with the spec as the spec source. Fix the findings in one implementer subagent, then `npm run verify`.
2. Write `.scratch/auto-apply/RUN_REPORT.md`:
   - tickets done and blocked (with one line on each blocker and what the human needs to decide),
   - decisions you made that the spec didn't cover,
   - deviations from the spec,
   - what the human should check by hand: the browser demo, UI copy and layout, anything marked "browser check pending",
   - the exact commands to try it locally (`claude --teleport`, `npm install`, `npm run dev`, then use the demo-check skill).
3. Commit everything and push the session branch.

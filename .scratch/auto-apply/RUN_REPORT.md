# Run report: /run-tickets 04 06-17 (2026-10-06)

Integration branch `claude/awesome-faraday-5g6o4h`, started from `1737411`. All tickets, the audit and the fix pass are merged and pushed.

**Final state:**

- `npm run verify` is green: shared 9, api 639, web 89 tests. The real-Firestore contract suite ran in a disposable `test-*` namespace.
- `npm run build` is green, and the no-localhost build test passes.
- `npm run test:e2e` is green: 1 spec, about 26 s.

[ShubhamMuthreja87/auto-apply#1](https://github.com/ShubhamMuthreja87/auto-apply/pull/1) was merged early, with only ticket 14. Everything after it is on the branch but not in any open PR, so a new PR is needed.

## Preconditions

- The spec, the tickets and ADR-0002 were present. `npm run verify` was green at the start.
- `FIREBASE_SERVICE_ACCOUNT_JSON` was set, so the Firestore integration suite ran on every verify. Nothing is "Firestore integration pending".
- Ticket 01 still said `ready-for-agent`, although it was built in `ec1b85a`. I treated it as done and corrected it in the audit.
- The `implement-spec` skill is in the repo but couldn't be loaded in this session, so I followed its steps by hand.

## Tickets

All tickets are `done`; none are blocked. Each ticket's `## Log` has commits, tests and decisions.

| Ticket | Result                                                                                           |
| ------ | ------------------------------------------------------------------------------------------------ |
| 04     | User document seeded from `seed/source/` only, loaded per run; `GET /api/me`                     |
| 06     | Greenhouse-only discovery (time cut), 15 boards, recorded per-board fallback                     |
| 07     | Seen-skip, hard blocks, transition table, 3 in flight, 15 AI evaluations                         |
| 08     | Rubric, scorer, D8 bands, keyword fallback matcher                                               |
| 09     | DeepSeek-compatible client, retry then fallback, `scoredBy`; real recordings                     |
| 10     | Greenhouse form merge, four-source field resolution, `needs_you`                                 |
| 11     | Simulated submit (never sent), D19 first-fail and Retry, Applied jobs view                       |
| 12     | Scanned jobs view, Settings view                                                                 |
| 13     | Relative `/api` URLs (fixes the production mixed-content bug), dev proxy, README, `.env.example` |
| 14     | Interrupted-run recovery, connection-state UX, double-click guard                                |
| 15     | Login, JWT cookie, `requireAuth`, rate limits, exact-origin CORS                                 |
| 16     | Playwright happy path in deterministic mode (fixtures, in-memory repo, no AI key)                |
| 17     | Editable Settings (`PUT /api/me`)                                                                |

Two unticked bullets remain: ticket 13's two `deploy/` bullets. **`deploy/` is not in this repo**, so they can't be checked.

## What the author decided during the run

- **Contract:** additive changes allowed (add fields and schemas; never rename, remove or narrow). Every change is listed in its ticket log. Ticket 11's implementer edited `contract.ts` through shell commands, so the approval hook didn't fire; I reviewed that diff line by line and it is additive only. Later implementers used the Edit tool.
- **Seed:** start date 2026-11-01, notice period 30 days, "LinkedIn" spelling, contact links from the settings file.
- **Demo:** a labelled synthetic demo board ("Demo Co (synthetic)") in fixtures mode and the e2e only, so D18/D19 can be shown. It is recorded in `docs/DECISIONS.md` and is never in the live registry.
- **Production bug:** fixed in ticket 13. Ticket 13 started only after 11 was merged, and 15–17 ran in parallel.
- **Lint:** ESLint ignores `.claude/worktrees/**`.
- **Ticket 10:** restarted from scratch after an interruption stopped its first attempt.
- **Playwright:** run in the cloud session against the preinstalled Chromium, set with `E2E_CHROMIUM_PATH`.
- **Deletions:** `skeleton-job-source.ts`, `awaiting-scoring-evaluator.ts`, `PlaceholderPage.tsx`, the hand-written AI fixtures, the committed `.DS_Store` (now gitignored), and all agent worktrees and local ticket branches.
- **Real DeepSeek recordings:** made for ticket 09.
- **Audit fixes:** all of them, plus the author's null rule. A posting that doesn't state something is never blocked on it, never earns or loses points for it, and never crashes the run.

## Decisions the spec didn't cover

- **Board cap:** `MAX_POSTINGS_PER_BOARD = 10` (newest first). Most postings block on location for an India-based profile; without the cap a run writes thousands of blocked records.
- **Title-based skips:** titles out of target are skipped in code, without using an AI slot. Terms of two letters or fewer (EY, Go, AI, QA) match exact case only.
- **Funnel counts:** `discovered` counts every discovered posting; `evaluated` counts only evaluator calls.
- **Gaps:** any met penalty criterion counts as a gap, so a score of 7+ with a gap is APPLY. The keyword matcher has default checks for the penalties, experience band and partial stack.
- **AI evidence:** an AI "met" counts only if its quote appears in the posting. Descriptions are cut at 12,000 characters. Weights are never sent to the model.
- **Language gate:** code triggers it on the title; the AI answers one zero-weight question per rule. Manager titles are never gated, the strictest cap wins, and an unknown stack means no cap.
- **New hard blocks:** staffing and company size are enforced in code, and only on what the posting states.
- **Free-text AI calls:** at most one per APPLY NOW job, and they don't count against the 15-evaluation cap. The model is asked only for required free text, and only when no other required field already needs the user.
- **Submit order:** submits run one at a time in discovery order, so the deliberate first failure is predictable. Retry reuses the stored answers, so there is no second AI call.
- **Recovery:** it also fails unfinished jobs, and a cut-off Retry in the last 5 runs. `queued → failed` is a new edge used only by recovery.
- **Auth extras:** `GET /api/session`, `POST /api/logout`, and the `hash-password` script. The auth env vars are required with no defaults; `JWT_SECRET` must be at least 32 characters.
- **Production start:** `apps/api` `npm start` is `node --env-file-if-exists=.env dist/index.js` (Node ≥22.9, run from `apps/api`).

## Deviations from the spec

- **Lever and Ashby:** not built; the author's time cut, recorded in DECISIONS.
- **No-localhost test:** the build contains react-router's internal `new URL("http://localhost")` placeholder, which is never requested. The test exempts only that exact literal, so `http://localhost:3001` or anything similar still fails it.
- **Deterministic mode:** e2e uses several env vars (`JOB_SOURCE=fixtures`, `REPO=memory`, empty AI key) rather than one flag.
- **Logs:** everything is in ticket `## Log`s, not under `## Comments`.

## Check by hand

1. **Browser demo:** run the demo-check skill locally, or click through. Log in, press Auto-apply, then check:
   - the live statuses and funnel
   - the "Fallback scoring" banner (no key)
   - Demo Co showing "Simulated failure (demo)", then Retry: the payload dialog opens and the job reads "Submitted (simulated)"
   - Applied jobs, Scanned jobs with evidence, a Settings edit and save, and Log out
     Only the e2e has run in a browser. UI copy and layout have not been reviewed by a human; the ticket logs mark these checks "browser check pending".
2. **Before deploying:**
   - The server's `apps/api/.env` must set `CORS_ORIGIN=https://assignment.muthreja.com`; production now refuses to start without it.
   - Add the auth vars (`AUTH_USERNAME`, `AUTH_PASSWORD_HASH` from `npm -w @auto-apply/api run hash-password` run locally, `JWT_SECRET`).
   - Check that pm2 runs `npm start` in `apps/api` or loads `.env` itself.
   - `deploy/` isn't in this repo, so I couldn't check any of this against it.
3. **Lockfile:** `package-lock.json` was regenerated with npm 10.9 here (for ticket 15's auth packages). It dropped some optional `libc` fields that your newer npm writes; they come back on your next `npm install`.
4. **Personal details:** the seed and the AI recordings contain your career facts, and the seed has your email and phone. That's fine for a private repo; consider it if the repo is public.
5. **AI spend:** besides the two approved recordings, ticket 15's manual smoke run may have made a few real DeepSeek calls, because a real `AI_API_KEY` is exported in this cloud environment. Those calls carried postings and criteria only.
6. **Known gaps, accepted:**
   - Recovery checks only the last 5 runs.
   - An expired session is detected only when the stream drops.
   - Some Safari versions reject the `Secure` cookie on http://localhost in dev.

## Try it locally

```sh
claude --teleport            # pick up this session's branch
npm install
cp apps/api/.env.example apps/api/.env   # fill in Firebase credentials, AUTH_*, JWT_SECRET; AI_API_KEY optional
npm run dev                  # api :3001 + web :5173 (Vite proxies /api)
# then use the demo-check skill, or open http://localhost:5173
npm run verify               # typecheck + lint + tests
npm run test:e2e             # Playwright happy path (deterministic)
```

For a run without network or AI, set `JOB_SOURCE=fixtures` and leave `AI_API_KEY` empty.

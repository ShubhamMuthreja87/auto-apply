# Spec: AI Auto-Apply prototype

Status: ready-for-agent

Scope: the full prototype described in `ASSIGNMENT.md`, interpreted by `docs/DECISIONS.md` (D1–D28) and the implementation decisions settled in grilling (recorded here, in `GLOSSARY.md`, and in `docs/adr/0001`–`0002`). This spec is the HOW; `DECISIONS.md` is the WHAT and wins on conflict. Vocabulary throughout is the glossary's: **Posting**, **Evaluation**, **Job Key**, **Verdict**, **Run**, **Seen**, **Namespace**.

## Problem Statement

A job-seeker wants to apply to many roles that fit their profile and preferences, but applying by hand is slow and repetitive, and fully automated "auto-apply" tools tend to fire off low-quality or wrong applications the user can't see or trust. The user wants to press one button, watch the system find real jobs, judge each against their own criteria with visible reasoning, fill the ones that qualify, and stop honestly at anything that needs a human — all in real time, without ever silently submitting something misleading.

## Solution

A full-stack prototype of the **AI Auto-apply** feature. The user logs in, lands on a single **Auto-apply** button, and presses it. The browser opens a live stream and watches a **Run** progress: the API discovers real **Postings** from public ATS job boards, skips ones already **Seen**, applies hard blocks in code, has the AI judge the rest per-criterion with quoted evidence, scores them into a **Verdict**, and for the top matches on Greenhouse merges the real application form and resolves each field from the user's profile/settings, the AI (free text only), or leaves it for the user. Qualifying jobs are **submitted (simulated)** — the real payload is built and stored but never sent — and anything with an unresolved required field is **held** as `needs_you`. Every outcome has a status and a reason, streamed live. The UI also offers Applied jobs, Scanned jobs, and an editable Settings page. The point is a clean, trustworthy front-end↔back-end interaction, not a production auto-apply engine.

## User Stories

1. As a job-seeker, I want a login page, so that my personal profile and my AI credit are not exposed on a public URL.
2. As a job-seeker, I want to stay logged in via a secure cookie, so that I don't re-authenticate on every page or stream.
3. As a job-seeker, I want a single **Auto-apply** button, so that I can trigger the whole flow with one action.
4. As a job-seeker, I want the button disabled while a Run is active, so that I don't accidentally start two Runs.
5. As a job-seeker, I want the API to reject a second concurrent Run with a clear error, so that one active Run per user is guaranteed even across tabs.
6. As a job-seeker, I want to see the Run move through `discovering → evaluating → applying → completed/failed`, so that I know what stage it is at.
7. As a job-seeker, I want live funnel counts (discovered, evaluated, applied, held, skipped, blocked, failed), so that I can see the shape of the outcome at a glance.
8. As a job-seeker, I want each Posting's status to stream in live (`queued → evaluating → blocked/skipped/held/applying → submitted/failed`), so that I can follow progress job by job.
9. As a job-seeker, I want every non-applied outcome to carry a reason, so that I understand why a job was blocked, skipped, held, or failed.
10. As a job-seeker, I want real jobs discovered from public Greenhouse, Lever and Ashby boards, so that the demo reflects a real market, not mock data.
11. As a job-seeker, I want a board that fails to still contribute jobs from a labelled fallback, so that a flaky source doesn't blank the Run.
12. As a job-seeker, I want Postings I've already Seen in earlier Runs to be skipped, so that I don't re-process or re-pay for the same jobs and a second Run looks different.
13. As a job-seeker, I want disqualifying facts (location/remote, visa, etc.) to hard-block a job in code before any AI runs, so that obviously-wrong jobs are rejected cheaply and correctly.
14. As a job-seeker, I want the AI to judge each soft criterion with a quoted piece of evidence, so that I can trust and audit the match.
15. As a job-seeker, I want the score and Verdict computed in code from the AI's per-criterion answers, so that scoring is reproducible and every point traces to a quote.
16. As a job-seeker, I want `APPLY NOW` jobs filled and submitted, `APPLY` jobs held below the auto-threshold, and `STRETCH`-and-below skipped, so that only high-confidence matches go out unattended.
17. As a job-seeker, I want Greenhouse application forms merged from all their question groups, so that required fields outside the main questions list (e.g. Stripe's School/Degree) are not missed.
18. As a job-seeker, I want each form field filled from exactly one source — my profile, my settings, the AI (free text only), or left for me — so that the system only automates what I've already decided.
19. As a job-seeker, I want my name, contact details and address filled deterministically in code and never sent to the AI, so that my PII is minimised.
20. As a job-seeker, I want legal agreements, employer AI-policy acknowledgements, consent and demographic questions never auto-answered, so that I remain the one who agrees to things.
21. As a job-seeker, I want a job with any unresolved required field held as `needs_you` with the missing fields listed, so that "auto" stays honest and I know exactly what to finish.
22. As a job-seeker, I want submission to be clearly simulated — payload built and stored, labelled "Submitted (simulated)", with a "View payload" option — so that nothing is ever presented as a real application.
23. As a job-seeker, I want the first submit in a Run to fail and a Retry to succeed, so that I can see the failure-and-recovery UX without a real error.
24. As a job-seeker, I want the AI step to retry once and then fall back to a labelled keyword matcher, so that a slow or malformed AI response never kills the Run.
25. As a job-seeker, I want the whole Run to use fallback scoring when no AI key is configured, so that the demo and tests work without a key.
26. As a job-seeker, I want at most 3 jobs evaluated in flight and at most 15 AI evaluations per Run, so that cost and duration are bounded and statuses stream in visibly.
27. As a job-seeker, I want an Applied jobs view, so that I can review what was submitted (simulated) and inspect each payload.
28. As a job-seeker, I want a Scanned jobs view, so that I can see everything that was evaluated and why each was blocked, skipped or held.
29. As a job-seeker, I want a Settings page showing my editable profile and preferences, so that I can correct what drives matching and field resolution.
30. As a job-seeker, I want my profile seeded on first boot, so that a fresh checkout works before I've entered anything.
31. As a job-seeker, I want to refresh or reconnect mid-Run and lose nothing, so that the live view is reliable.
32. As a job-seeker, I want the browser to show connection state (connecting, live, reconnecting, closed), so that I can tell live data from a stalled stream.
33. As a job-seeker, I want a Run interrupted by a server restart to show as `failed (interrupted)` rather than hang forever, so that the UI never lies about a stuck Run.
34. As a reviewer, I want to press the button on a deployed URL and watch it work, so that I can evaluate the prototype myself.
35. As the developer, I want the browser to never touch Firebase or the AI, so that there is one clean API boundary.
36. As the developer, I want job descriptions treated as untrusted data in prompts, so that prompt-injection in a posting can't redirect the AI.

## Implementation Decisions

### Contract (`packages/shared`)
- One `contract.ts` holds all shared zod schemas and types: API payloads, SSE event payloads, Firestore document shapes, the status+reason unions, the rubric criteria and band thresholds, and the `Limits` constants (`MAX_IN_FLIGHT = 3`, `MAX_AI_EVALS = 15`). Changes to this file go through the human gate + hook.
- Run and Evaluation status are discriminated unions carrying their reason only where meaningful, e.g. (shape from grilling, trimmed): `blocked:<reason>`, `skipped:'seen'|'stretch'|'limit'`, `held:'needs_you'`, `failed:'simulated'|'interrupted'|<reason>`.
- A centralised transition table per machine (pure functions) validates every status change and throws on an illegal move; the only backward edge is Retry on a simulated failure (D19).

### Persistence (`Repo` port + two adapters)
- All pipeline and route code depends on one `Repo` interface, never on `firebase-admin`. Interface shape from grilling (trimmed to the decision):

  ```ts
  interface Repo {
    getUser(uid): Promise<UserDoc | null>;
    seedUserIfMissing(uid, doc): Promise<void>;
    createRun(run): Promise<void>;            // rejects if an active Run exists → 409
    getActiveRun(uid): Promise<Run | null>;
    patchRun(runId, delta): Promise<void>;
    putEvaluation(runId, evalDoc): Promise<void>;
    patchEvaluation(runId, jobKey, delta): Promise<void>;
    isSeen(jobKey): Promise<boolean>;
    markSeen(jobKey): Promise<void>;
    watchRun(runId, cb): Unsubscribe;          // async initial snapshot, then per-change deltas
    watchEvaluations(runId, cb): Unsubscribe;
  }
  ```
- Firestore layout is the namespace-root-document of ADR-0001: `ns/{namespace}/runs/{runId}`, `runs/{runId}/jobs/{evalId}`, `ns/{namespace}/seen/{jobKey}`, `ns/{namespace}/users/{uid}`. `seen` sits beside `runs` (dedupe spans Runs).
- IDs: `runId = crypto.randomUUID()`; one `jobKey(posting)` → `${ats}:${board}:${jobId}` is both the Evaluation doc id and the Seen key.
- Funnel counts use `FieldValue.increment`/derivation, never read-modify-write. Each Evaluation is its own document, never an array in the Run doc.
- The in-memory twin mirrors the logical layout and the subscription semantics exactly: initial callback delivered on a microtask (not synchronously), then a callback on every matching write (local writes echo back), ordering preserved.
- On startup the API marks any Run still `running` from before boot as `failed:interrupted`.

### Credentials
- One `loadCredential()`: `FIREBASE_SERVICE_ACCOUNT_JSON` takes precedence — `JSON.parse` the value, and if that throws, base64-decode then parse; otherwise use `GOOGLE_APPLICATION_CREDENTIALS` (file path). The parsed service account is zod-validated at boot. Env is parsed once at startup and fails fast. Code refuses to start with `FIRESTORE_NAMESPACE=prod` unless `NODE_ENV=production`.

### Discovery & ATS adapters
- `JobSource { readonly ats; discover(board): Promise<Posting[]> }`, one adapter per ATS, a registry mapping ~15 hardcoded boards. GET only, plain `fetch` with an `AbortController` timeout. A failed board falls back to that board's recorded fixtures, labelled as fallback (D3).
- `Posting` normalises to `{ ats, board, jobId, title, company, location, descriptionText, applyUrl }` plus a parsed `remote` boolean; HTML stripped to text.
- Greenhouse form fetch (`?questions=true`) is a **separate capability** (`GreenhouseForms.fetchSchema(jobId)`), not a method Lever/Ashby must stub.

### Evaluation (hard blocks → AI → score)
- Hard blocks are pure predicates over `Posting` + preferences, run first; any failure short-circuits to `blocked:<reason>` and spends no AI tokens.
- `JobEvaluator` returns, per AI-judged criterion, `{ met: boolean, evidence: string }` (a quote) — no scores, no verdict. The code/AI split is by **reliability**: code judges only what it can parse and compute properly (tier, remote, location, comp if present); everything requiring judgement over prose goes to the AI. (Split is optimisation/correctness, not token-saving.)
- Code multiplies met criteria by weights, sums, and maps the total onto the D8 bands; thresholds are named constants in the contract. Verdict drives action: `APPLY NOW` → fill+submit; `APPLY` → `held:below_auto_threshold`; `STRETCH` and below → `skipped:stretch`.
- The AI client lives only in `apps/api/src/ai/`, plain `fetch` to `AI_BASE_URL`, `AbortController` timeout, asks for JSON, strips Markdown fences, zod-validates. Job descriptions are delimited and labelled as untrusted data (prompt-injection defence). No PII in prompts (D23); free-text answers must trace to profile/settings; job-title tier selects EM vs Staff framing (D12).

### Fallback
- A keyword matcher implements the same `{met, evidence}` interface as the AI (evidence = matched snippet), so the scorer is agnostic to source. On AI timeout/invalid JSON: retry once, then fall back for that Evaluation. With no AI key: the whole Run uses the matcher. Each Evaluation records `scoredBy: 'ai' | 'fallback'`, surfaced in the UI as "fallback scoring".

### Greenhouse form merge & field resolution
- Merge `questions`, `location_questions`, `education`, and `compliance/demographic_questions` (hosted URL, embed fallback) into one normalised `Field` = `{ id, label, type: text|textarea|select|multiselect|file|boolean, required, options? }`.
- A pure resolver classifies each field to exactly one of four sources in order: (1) API compliance/demographic/legal group → **user-only** (never auto, D10); (2) label/id → **profile/settings** map for standard fields, filled in code (name/contact stay in code, never the model); (3) remaining free-text/essay → **AI**; (4) anything left → **user-only**. It returns `{field, source, value?}[]`, feeding both the payload builder and the missing-fields list.
- Any **required** field that resolves without a value → the Evaluation is `held:needs_you` listing those fields.

### Submission (simulated)
- `ApplicationSubmitter` builds the real Greenhouse payload with real field IDs, waits (injected `delay`), stores it, and never sends it. Labelled "Submitted (simulated)" with a banner and "View payload". The first submit per Run fails with `failed:simulated`; Retry (explicit backward edge) rebuilds/shows the payload and succeeds.

### Pipeline composition & limits
- A single `buildPipeline(deps)` composition root takes every port plus injected `clock` and `delay`; the pipeline news-up nothing itself. It is a deep module with ports, not a pile of helpers.
- A tiny inline semaphore enforces 3 jobs in flight (no `p-limit`). A per-Run counter gates AI calls to 15; seen-skips and hard-blocks don't count. Once the cap is hit the pipeline stops pulling further Postings; unpulled Postings are not persisted.

### API (Express)
- Routes are thin: zod-parse → pipeline/service → HTTP. Long work never blocks: `POST /api/runs` starts the Run and returns `202 { runId }`; a second active Run → `409`. Body size capped; errors return a JSON shape from the contract, never a stack trace. `app.set('trust proxy', 1)`.
- SSE (`GET /api/runs/:runId/events`): `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`. On connect, await the first callback of `watchRun` + `watchEvaluations`, coalesce into one named **`snapshot`** event (full Run + all Evaluations + funnel counts), then stream **`run`** and **`eval`** deltas; heartbeat comment every 15 s. On terminal Run status emit the terminal `run`, then **`done`**, then end the response. On `req.on('close')` unsubscribe the listeners and clear the heartbeat. No `Last-Event-ID`; every connect re-snapshots.

### Auth
- `POST /api/login` checks `AUTH_USERNAME` + `AUTH_PASSWORD_HASH` (bcryptjs, cost 12), signs a minimal PII-free JWT (`sub`=fixed uid, `iat`, 12 h `exp`) with `JWT_SECRET`, sets it in an `httpOnly; Secure; SameSite=Strict` cookie. `requireAuth` middleware verifies the cookie on all `/api/*` except login and is shared by the SSE route (verify at connect only). `express-rate-limit` on login and on `POST /api/runs`. CORS allows exactly one origin from env, with credentials (never `*`).

### Web (React + Vite)
- Routed pages: login, live Run, Applied jobs, Scanned jobs, Settings. Function components + hooks, no global-state library. The SSE connection lives in one `useRunStream(runId)` hook that parses events with the contract schemas and closes the `EventSource` on unmount / runId change; opened with `withCredentials: true` so the cookie rides the dev cross-origin stream. Components render connecting/live/reconnecting/closed and loading/empty/error. The browser never imports Firebase or an AI SDK and never references an AI key (hook-enforced).

## Testing Decisions

A good test here asserts **external behaviour at a seam**, never implementation details: given fixtures/fakes in, assert the Run/Evaluation statuses, funnel counts, stored payloads, resolved fields, and streamed events out. No snapshot tests; no tests of private functions. Pure logic (scoring, hard blocks, verdict banding, field resolution, the transition table) is unit-tested directly with table-driven cases. Tests never call real ATS or AI endpoints. Vitest everywhere; Supertest for the API; React Testing Library for components; Playwright for one end-to-end path.

Seams:

1. **Pipeline seam (primary).** `buildPipeline(deps)` with fake ports (in-memory `Repo`, fixture `JobSource`/`GreenhouseForms`, canned `JobEvaluator`, fake `ApplicationSubmitter`, injected `clock`/`delay`). Covers discovery, seen-skip, hard blocks, scoring/verdict, field resolution, limits (3-in-flight, 15-AI-cap), state transitions, simulated submit, and D19 first-fail-then-retry — no network, no AI, no real sleep.

2. **Repository contract seam.** One shared contract test suite run against **both** `Repo` implementations so the in-memory twin cannot drift from Firestore semantics — initial snapshot delivery, delta ordering, and `increment` behaviour are all asserted. The in-memory implementation always runs; the Firestore implementation runs when credentials are present, in a disposable `test-<random>` namespace torn down with `recursiveDelete`.

3. **Adapter seam (injected `fetch`, recorded real responses).** The Greenhouse/Lever/Ashby discovery adapters, the Greenhouse form-schema merge, and the AI client are each tested with an **injected `fetch`** returning recorded real responses. The same recordings double as the D3 per-board fallback fixtures. The recorded set includes the **Stripe** and **Anthropic** Greenhouse forms (the ones that exposed School/Degree outside `questions` and the AI-policy/arbitration acknowledgements, D5/D10).

4. **HTTP + SSE seam.** Supertest against the Express app wired to the in-memory `Repo`: `POST /api/runs` (202 / 409), login + `requireAuth` on protected routes and on the stream, and reading the SSE stream (`snapshot` → `run`/`eval` → `done`).

5. **UI seam.** React Testing Library with a **fake `EventSource`** feeding contract-shaped events into `useRunStream`; assert connecting/live/reconnecting/closed and loading/empty/error states.

6. **E2E seam.** One Playwright happy path in a **deterministic mode**: a fixtures-only job source selected by an env flag and **no AI key** (so the Run uses fallback scoring), making the end-to-end button→stream→submitted-simulated path reproducible without network or AI.

Prior art: none yet (greenfield); these seams and their fakes are established by the first tickets and reused thereafter.

## Out of Scope

Everything in the `DECISIONS.md` "Out of scope" list, notably: real submission to employers (browser workers, extension, employer APIs); review mode / approval queue (argued as the launch default in the design doc, not built); applying through Lever or Ashby or any non-Greenhouse ATS; agentic web discovery; re-evaluating Seen Postings when a posting or preferences change; retry limits, failure triage, human oversight of failures; a guardrails/PII-redaction framework, batching, embedding prefilter, LangChain or any agent framework; resume parsing into the profile; multi-user support, signup, password reset, roles; scheduled/background runs and notifications; horizontal scaling, queues, multiple pm2 instances; an evaluation harness for match quality.

## Further Notes

- `DECISIONS.md` wins over this spec on any WHAT conflict; this spec wins over prose summaries in `CLAUDE.md` on HOW.
- SSE buffering: nginx buffers by default, so verify the deployed stream with `curl -N`; the API sets `X-Accel-Buffering: no` and nginx uses `proxy_buffering off` on `/api`.
- Deploy (EC2 + nginx + certbot + pm2) is prepared in `deploy/` but every deploy is run by a human (D28); Claude never runs `deploy.sh`, `ssh`, or `certbot` unasked.
- The allowed dependency list is ADR-0002; anything off it goes through the human dependency gate.
- Tickets will be broken out under `.scratch/auto-apply/issues/` as vertical slices, each demoable through the UI or an API call.

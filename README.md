# AI Auto-Apply prototype

A full-stack prototype of an "AI auto-apply to jobs" feature, built as a time-boxed take-home for Careerflow.ai. One click starts a **Run**: the API discovers jobs on public Greenhouse boards, screens and scores them (AI with a keyword fallback), fills the application form from the user's profile, and **simulates** the submission. The browser watches every step live over server-sent events.

Nothing is ever sent to an employer: discovery uses GET requests to public job-board APIs only, and submission builds and stores the real payload without posting it (D18). The requirements are in `ASSIGNMENT.md`, the product decisions in `docs/DECISIONS.md` (cited as D1, D2, ...), the architecture decisions in `docs/adr/`, and the vocabulary in `GLOSSARY.md`.

## Setup

Node 22.9 or newer (the scripts use `--env-file-if-exists`); the author develops and deploys on Node 26.

```sh
npm install
cp apps/api/.env.example apps/api/.env      # then fill it in (see below)
npm -w @auto-apply/api run hash-password    # prints AUTH_PASSWORD_HASH; reads the password from stdin
npm run dev                                 # API on :3001, web on :5173
```

Open http://localhost:5173 and sign in with `AUTH_USERNAME` and the password you hashed.

`apps/api/.env.example` documents every variable the API reads (a test checks that). The minimum for local work:

| Variable                                                            | Local value                                                                                                                                               |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH_USERNAME`, `AUTH_PASSWORD_HASH`, `JWT_SECRET`                 | Required, no defaults: the API refuses to start without them (D26).                                                                                       |
| `GOOGLE_APPLICATION_CREDENTIALS` or `FIREBASE_SERVICE_ACCOUNT_JSON` | The Firebase service-account key, kept outside the repo. Or set `REPO=memory` to run on the in-memory store (not persisted, never allowed in production). |
| `FIRESTORE_NAMESPACE`                                               | `dev`. `prod` is refused unless `NODE_ENV=production`.                                                                                                    |
| `AI_API_KEY`                                                        | Optional. Without it every Run uses the keyword fallback matcher and the UI says so (D24).                                                                |
| `JOB_SOURCE`                                                        | `live` (default) reads the public boards; `fixtures` uses only the recorded boards, with no network.                                                      |

For a fully offline demo: `REPO=memory JOB_SOURCE=fixtures AI_API_KEY= npm run dev`.

The web app has **no environment variables**. It always calls the API with relative `/api/...` URLs, so it only ever talks to its own origin.

## Architecture

```
Browser (React, :5173 in dev)
   │  relative /api/... (fetch with the session cookie; EventSource for the stream)
   ▼
Vite dev proxy (dev)  /  nginx with HTTPS (production)
   │  /api → http://localhost:3001
   ▼
Express API (:3001, one process)
   ├─ pipeline, in-process ──▶ Greenhouse public board APIs (GET only, fixture fallback per board)
   │                       ──▶ OpenAI-compatible chat API (DeepSeek by default; apps/api/src/ai/ only)
   └─ Repo port ──▶ Firestore (Admin SDK, namespaced)  or  in-memory twin
```

**Monorepo** (npm workspaces, TypeScript strict):

- `packages/shared`: `src/contract.ts`, the zod schemas and types for API payloads, SSE events, Firestore documents and the status enums. Both apps parse every boundary with it.
- `apps/api`: Express. Routes stay thin; the pipeline depends on ports, never on `firebase-admin` directly.
- `apps/web`: React + Vite + MUI. No Firebase code and no AI calls in the browser.

**Ports.** Web 5173 and API 3001 in dev. In dev the Vite server proxies `/api` (the SSE stream included, unbuffered) to the API, so dev is same-origin like production. In production nginx serves `apps/web/dist` and proxies `/api` to the API on 3001.

**The pipeline** (one Run per user at a time; a second `POST /api/runs` gets `409`):

1. `POST /api/runs` creates the Run and answers `202 { runId }`; the pipeline continues in the background.
2. **Discover**: read the configured Greenhouse boards (D2); a board that fails falls back to its recorded fixture, labelled as such (D3).
3. **Skip seen** postings from earlier Runs (D15), then apply the **hard blocks** in code (D7).
4. **Evaluate**: the AI returns per-criterion evidence; code computes the score and the verdict (D7, D8). At most 15 AI evaluations per Run and 3 jobs in flight (D17). Without an AI key, the keyword fallback matcher scores everything (D24). No personal data is sent to the model (D23).
5. **Apply** (APPLY NOW verdicts): merge the Greenhouse form schema (D5) and resolve each field from the profile, settings, AI free text, or the user (D9, D10). An unanswerable required field holds the job as `needs_you` (D11).
6. **Simulated submit**: build and store the real payload without sending it (D18). The first submit of each Run fails on purpose; Retry succeeds (D19).

Statuses (D16): a Run moves `discovering → evaluating → applying → completed | failed` with funnel counts; each job moves `queued → evaluating → blocked | skipped | held | applying → submitted (simulated) | failed`, with a reason. A Run left active by a restart is marked failed as interrupted on the next boot.

**Live updates (SSE).** The browser opens `GET /api/runs/:runId/events`. The API subscribes to the Run and its Evaluations through the repository (Firestore `onSnapshot`, or the in-memory twin's equivalent) and sends one `snapshot` event, then `run` and `eval` deltas, then `done` when the Run ends (D21). The response sets `Content-Type: text/event-stream`, `Cache-Control: no-cache` and `X-Accel-Buffering: no`, and sends a heartbeat comment every 15 s. The browser reconnects and resumes from a fresh snapshot.

**Auth** (D26). One user, no signup. `POST /api/login` checks the username and a bcrypt hash (cost 12) from env and sets a JWT in an `httpOnly; Secure; SameSite=Strict` cookie with a 12-hour expiry; login is rate-limited. Every `/api` route except health, login and logout needs the cookie, the SSE stream included. CORS allows exactly one origin (`CORS_ORIGIN`) with credentials, never `*` (D27). Express runs with `trust proxy` set to 1 behind nginx.

Browsers treat `http://localhost` as a secure context, so Chrome and Firefox keep the `Secure` cookie in dev without HTTPS. Some Safari versions do not; use Chrome or Firefox for local work.

**Persistence.** One Firebase project serves dev, tests and production; every collection path is prefixed by `FIRESTORE_NAMESPACE` (`dev`, `prod`, or `test-<random>`) under a namespace root document (ADR-0001). The database is in production mode, so browsers have no access (`firestore.rules`); only the API reads and writes.

## Commands

| Purpose                                       | Command                                                          |
| --------------------------------------------- | ---------------------------------------------------------------- |
| Install                                       | `npm install`                                                    |
| Local dev (API + web)                         | `npm run dev`                                                    |
| Typecheck / lint / unit and integration tests | `npm run typecheck` / `npm run lint` / `npm test`                |
| All three (before every commit)               | `npm run verify`                                                 |
| Production build                              | `npm run build`                                                  |
| Production start (from `apps/api`)            | `npm start`, i.e. `node --env-file-if-exists=.env dist/index.js` |

## Testing

Vitest everywhere. Tests never call a real job board or AI provider: they use recorded fixtures and fakes. The seams (spec, Testing Decisions):

1. **Pipeline**: `buildPipeline(deps)` with fake ports (in-memory repository, fixture job source and forms, canned evaluator, fake submitter, injected clock and delay). Covers discovery, seen-skip, hard blocks, scoring, field resolution, limits, state transitions and the D19 first-fail-then-retry.
2. **Repository contract**: one shared suite (`apps/api/src/repo/repo-contract.ts`) runs against both implementations, so the in-memory twin cannot drift from Firestore.
3. **Adapters**: the Greenhouse discovery and form adapters and the AI client, each with an injected `fetch` returning recorded real responses (`apps/api/fixtures/`).
4. **HTTP + SSE**: Supertest against the Express app on the in-memory repository: run creation (`202`/`409`), login and the auth gate on every protected route and the stream, and reading the SSE stream.
5. **UI**: React Testing Library with a fake `EventSource` feeding contract-shaped events.
6. **Production build**: `apps/web/src/production-build.test.ts` builds the web app with the production config into a temporary directory and fails if the bundle contains "localhost", so an absolute dev API URL can never ship again.

How to run each suite:

- **Everything except end-to-end**: `npm test` (or `npm run verify`). Per workspace: `npm -w @auto-apply/api test`, `npm -w @auto-apply/web test`, `npm -w @auto-apply/shared test`.
- **The Firestore integration suite** (`apps/api/src/repo/firestore-repo.test.ts`) is credential-gated: it runs inside `npm test` when `GOOGLE_APPLICATION_CREDENTIALS` or `FIREBASE_SERVICE_ACCOUNT_JSON` is set, in the shell or in `apps/api/.env`, and is skipped otherwise. It uses a fresh `test-<random>` namespace and deletes it afterwards.
- **End-to-end**: `npm run test:e2e` (not part of `npm run verify`; about 30 s). One Playwright happy path (`e2e/happy-path.spec.ts`): log in, press Auto-apply, watch the Run stream to Completed, see the demo job's "Simulated failure (demo)", Retry it on Applied jobs, see "Submitted (simulated)". `playwright.config.ts` starts the API from source and the Vite dev server (so `/api` and the stream go through the dev proxy, same origin as production) in a deterministic mode: `JOB_SOURCE=fixtures` (no network; includes the labelled synthetic "Demo Co (synthetic)" board), `REPO=memory`, `FIRESTORE_NAMESPACE=test-e2e`, and `AI_API_KEY` forced empty even if the shell exports one. It never reads `apps/api/.env`. The login is a fixed, non-secret e2e-only value (`e2e/credentials.ts`), hashed when the config loads. Ports 3001 and 5173 must be free: the run never reuses a running dev server. It needs Playwright's Chromium (`npx playwright install chromium` once); to use a Chromium already on the machine instead, set `E2E_CHROMIUM_PATH` to its executable.

## Production

The build emits plain JavaScript:

- `packages/shared` → `packages/shared/dist`
- `apps/api` → `apps/api/dist` (test support files are excluded)
- `apps/web` → `apps/web/dist` (static files for nginx)

The server needs production dependencies only (`npm ci --omit=dev`) and runs `node --env-file-if-exists=.env dist/index.js` from `apps/api` (`npm start`). It reads its config from `apps/api/.env`, with `NODE_ENV=production`, `FIRESTORE_NAMESPACE=prod`, `CORS_ORIGIN=https://<domain>`, the credential path outside the repo, the auth variables and the `AI_*` variables. Variables already set in the process environment win over the file.

Deployment uses EC2 with nginx, certbot and pm2 (one instance, on purpose). A human runs every deploy.

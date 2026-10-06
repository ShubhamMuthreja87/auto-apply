# AI Auto-Apply prototype

Time-boxed take-home for Careerflow.ai: a full-stack prototype of an "AI auto-apply to jobs" feature, plus written deliverables. Requirements live in `ASSIGNMENT.md` and win over anything else. **Product decisions live in `docs/DECISIONS.md`** (numbered; cite them as D1, D2, ...). The goal is to **show clean front-end ↔ back-end interaction**, not to build a real auto-apply product. Prefer simple, demoable and well-tested over feature-rich. The finished prototype is deployed to an EC2 instance on the author's own domain.

## Stack (defaults; change only through an ADR in `docs/adr/`)

- Monorepo with npm workspaces, TypeScript strict everywhere. Node `>=22` (`engines` field); the author develops on Node 26 and production runs the same major version.
- `apps/web`: React + Vite + TypeScript. Receives live status from the API over server-sent events (`EventSource`). No Firebase code in the browser.
- `apps/api`: Express + TypeScript. `firebase-admin` for Firestore, `zod` at every boundary. Streams run updates to the browser over SSE.
- `packages/shared`: `src/contract.ts` holds the shared types and zod schemas (API payloads, SSE event payloads, Firestore documents, the status enum). It is the contract between web and api. Edits to it require human approval; a hook asks.
- **Firestore**: one real Firebase project for everything (no emulator, no Java). Isolation comes from a **namespace**: every collection path goes through one function that prefixes it with `FIRESTORE_NAMESPACE` (`dev` locally, `prod` on the server, a unique `test-<random>` per test run). Credentials come from `FIREBASE_SERVICE_ACCOUNT_JSON` (the key JSON as one env var; used in cloud sessions) or `GOOGLE_APPLICATION_CREDENTIALS` (path to the key file; used locally and on the server). The database was created in production mode, so browsers have no access; only the API (Admin SDK) reads and writes. `firestore.rules` documents that.
- **Persistence port**: the pipeline and routes depend on a repository interface, never on `firebase-admin` directly. Two implementations: Firestore, and an in-memory one with the same subscription behaviour (for `onSnapshot`-style live updates). Most tests use the in-memory one; a small Firestore integration suite exercises the real adapter.
- **AI**: an OpenAI-compatible chat-completions API called with plain `fetch` from `apps/api/src/ai/`. DeepSeek by default; any compatible provider works by changing env vars:
  `AI_PROVIDER` (label only), `AI_BASE_URL` (e.g. `https://api.deepseek.com`), `AI_MODEL` (e.g. `deepseek-chat`), `AI_API_KEY`.
  With no `AI_API_KEY`, the whole run uses the keyword fallback matcher and the UI says so (D24). Tests always use fakes.
  **No PII to the model** (D23): never send the user's name, contact details or address. Standard form fields are filled deterministically in code. The demo uses DeepSeek; the design doc states that production would use a provider with a DPA and no-training terms (D22).
- **Job sources**: the public, read-only job-board APIs of Greenhouse, Lever and Ashby (D2), behind a `JobSource` port with one adapter per ATS. Fixtures are the test fake and a labelled per-board fallback (D3). GET only.
- Tests: Vitest everywhere, Supertest for the API, React Testing Library for components, Playwright for one end-to-end happy path.

## Flow (from `docs/DECISIONS.md`; the grilling settles the details)

1. User clicks **Auto-apply** → `POST /api/runs` → the API creates a run and returns `202 { runId }`. One active run per user (`409`).
2. The browser opens `GET /api/runs/:runId/events` (SSE). The API sends a full snapshot, then deltas, from Firestore `onSnapshot` listeners (D21).
3. The pipeline runs in-process: load the user document (profile, preferences, settings) from Firestore → discover jobs from the ATS boards (fixture fallback per board) → skip seen jobs (D15) → hard blocks in code (D7) → AI returns per-criterion evidence, code scores and sets the verdict (D7, D8) → for APPLY NOW jobs on Greenhouse, merge the form schema (D5) and resolve every field from profile, settings, AI free text or user-only (D9, D10) → unresolved required fields hold the job as `needs_you` (D11) → simulated submit builds and stores the real payload (D18), with the first submit per run failing on purpose and Retry succeeding (D19).
4. Statuses (D16): run `discovering → evaluating → applying → completed | failed` with funnel counts; job `queued → evaluating → blocked | skipped | held | applying → submitted (simulated) | failed`, each with a reason. Limits (D17): 3 jobs in flight, at most 15 AI evaluations per run.
5. UI (D20): the button and live run, Applied jobs, Scanned jobs, Settings, and a login page (D26).
6. Ports (`JobSource`, `JobEvaluator`, `ApplicationSubmitter`, the repository) keep the pipeline testable with fakes.

## Dependencies

The grilling produces an ADR that lists every runtime and dev dependency up front. Anything on that list can be installed without asking (this keeps unattended cloud runs moving); anything else goes through the human gate below.

## Commands (update with the exact scripts after scaffolding)

| Purpose | Command |
|---|---|
| Install | `npm install` |
| Local dev (api + web, against the `dev` namespace) | `npm run dev` |
| Typecheck | `npm run typecheck` |
| Lint | `npm run lint` |
| Unit and integration tests | `npm test` (in-memory repository; the Firestore integration suite runs when credentials are set, in a unique `test-*` namespace it deletes afterwards) |
| End-to-end | `npm run test:e2e` |
| **Verify (before every commit)** | `npm run verify` = typecheck + lint + test |
| Production build | `npm run build` (web → `apps/web/dist`, api → `apps/api/dist`, shared → `packages/shared/dist`; the server runs plain `node` on the built files with production dependencies only) |

Ports: web 5173, api 3001. In production nginx serves the web build and proxies `/api` to the API on 3001.

## Deployment (EC2 + nginx + certbot + pm2)

Details and templates are in `deploy/`. Key facts for code:
- Same origin in production (`https://<domain>` serves the app, `/api` is proxied). CORS still allows exactly one origin from env, with credentials (D27); never `*`.
- Auth (D26): one user, bcrypt hash (cost 12) in env, JWT in an `httpOnly; Secure; SameSite=Strict` cookie, 12-hour expiry, no signup, rate-limited login. The cookie authenticates the SSE stream. Use `bcryptjs` (pure JS) so nothing native has to compile in cloud sessions or on EC2.
- Express runs behind nginx: `app.set("trust proxy", 1)`.
- The SSE response sets `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`, and sends a heartbeat comment every 15 s.
- The API reads production config from `apps/api/.env` on the server: `NODE_ENV`, `PORT`, `FIRESTORE_NAMESPACE=prod`, `GOOGLE_APPLICATION_CREDENTIALS` (path to the service-account file, outside the repo) or `FIREBASE_SERVICE_ACCOUNT_JSON`, the auth and CORS vars, and the `AI_*` vars.
- A human runs every deploy. Claude may prepare deploy files but never runs `deploy/deploy.sh`, `ssh`, or `certbot` without asking.

## Rules

- Read `CODING_STANDARDS.md` before writing code.
- Work in vertical slices: every ticket ends demoable through the UI or an API call.
- Never commit secrets. Keys live in gitignored `.env` files; commit `.env.example` instead.
- Discovery reads real, public ATS job-board APIs with GET requests only (D2). **Never send a POST, or any write, to an ATS or employer endpoint.** Submission is always simulated (D18), and the UI says so.
- Tests never call real ATS or AI endpoints; they use fixtures and fakes.
- Never use the `prod` namespace outside the server.
- If something in `ASSIGNMENT.md` is ambiguous, ask, then record the answer under its Notes.

## Human gates (control as well as automation)

Routine, reversible work runs without asking. These always stop for a real question first: what you want to do, why, and the alternatives. A bare yes/no permission prompt is not enough.

- Adding a dependency that is not in the dependency ADR, or removing or upgrading one.
- Deleting files.
- Changing `packages/shared/src/contract.ts` (a hook also asks).
- Any architectural change not covered by an ADR.
- Pushing, deploying, or anything that touches the server. A human pushes, merges and deploys.

Subagents that hit one of these stop and report back instead of proceeding.

## Enforced by hooks (can't be talked around)

- AI provider calls (`/chat/completions`, provider hosts, SDKs) only in `apps/api/src/ai/`.
- `apps/web` never imports `firebase-admin`, Firebase, or an AI SDK, and never references an AI key.
- No agent or RAG frameworks (LangChain, LlamaIndex, vector stores).
- No finishing a turn with type errors.

## Deliverable documents

They live in `docs/deliverables/`. Write them with the `write-deliverable` skill. Every technical claim in a document must match the code, ADRs or spec; the `doc-reviewer` subagent checks this.

## Agent skills

### Issue tracker

Local markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: `GLOSSARY.md` at the repo root and ADRs in `docs/adr/`. See `docs/agents/domain.md`.

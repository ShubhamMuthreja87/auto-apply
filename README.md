# AI Auto-Apply

A full-stack prototype of an "AI auto-apply to jobs" feature, built as the Careerflow.ai Engineering Manager take-home.

**Live demo: [assignment.muthreja.com](https://assignment.muthreja.com)**

One click starts a **Run**. The API finds jobs on public Greenhouse boards, screens and scores them with AI (or a keyword fallback), fills the application form from the user's profile, and **simulates** the submission. The browser shows every step live over server-sent events.

> Nothing ever reaches an employer. Discovery only sends GET requests to public job-board APIs. Submission builds and stores the real payload but never sends it (D18).

---

## Documents

|     | Document                                                                                                                              | What's in it                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 📐  | [Technical Design Document](docs/deliverables/01-technical-design.md)                                                                 | Production architecture, AI integration, scaling, security and compliance, risk assessment |
| 🗺️  | [Implementation Roadmap and Project Plan](docs/deliverables/02-project-plan.md)                                                       | Team, phases, timeline, critical path, rollout gates, leadership                           |
| 📋  | [Notion task board](https://app.notion.com/p/AI-Auto-apply-Project-Plan-Task-Board-3f21ca28f8dd81cfb342c1f213cf3b56?source=copy_link) | 132 tasks, with board and timeline views                                                   |
| 🤖  | [Responsible Use of AI](docs/deliverables/04-responsible-ai.md)                                                                       | How AI was used, what I decided, where the guardrails mattered                             |
| 🧾  | [AI traces](traces/readme.md)                                                                                                         | Index of every shared chat and Claude Code session                                         |

Background material:
[`ASSIGNMENT.md`](ASSIGNMENT.md) (the brief) ·
[`docs/DECISIONS.md`](docs/DECISIONS.md) (product decisions, cited as D1, D2, …) ·
[`docs/adr/`](docs/adr/) (architecture decisions) ·
[`GLOSSARY.md`](GLOSSARY.md) ·
[`CODING_STANDARDS.md`](CODING_STANDARDS.md) ·
[`.scratch/auto-apply/`](.scratch/auto-apply/) (spec, tickets, cloud run report)

---

## Quick start

**Requirements:** Node 22.9 or newer (developed and deployed on Node 26). A Firebase service-account key is optional; without one you can run on the in-memory store.

```sh
npm install
cp apps/api/.env.example apps/api/.env
npm -w @auto-apply/api run hash-password    # reads a password on stdin, prints AUTH_PASSWORD_HASH
openssl rand -hex 32                        # use as JWT_SECRET
npm run dev                                 # API on :3001, web on :5173
```

Open <http://localhost:5173> and sign in with `AUTH_USERNAME` and the password you hashed. Use Chrome or Firefox locally: some Safari versions drop the `Secure` cookie on `http://localhost`.

**Fully offline** (no Firebase, no network, no AI key):

```sh
REPO=memory JOB_SOURCE=fixtures AI_API_KEY= npm run dev
```

### Environment

Every variable is documented in [`apps/api/.env.example`](apps/api/.env.example), and a test keeps that file complete. The web app has no environment variables; it only calls relative `/api/...` URLs.

| Variable                                                            | Notes                                                                                                                         |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `AUTH_USERNAME` · `AUTH_PASSWORD_HASH` · `JWT_SECRET`               | **Required.** The API won't start without them.                                                                               |
| `GOOGLE_APPLICATION_CREDENTIALS` or `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase key, kept outside the repo. Or set `REPO=memory`.                                                                    |
| `FIRESTORE_NAMESPACE`                                               | `dev` locally. `prod` is refused outside `NODE_ENV=production`.                                                               |
| `AI_API_KEY` · `AI_BASE_URL` · `AI_MODEL`                           | Any OpenAI-compatible provider (DeepSeek by default). Without a key, the keyword matcher scores every job and the UI says so. |
| `JOB_SOURCE`                                                        | `live` (default) reads the public boards; `fixtures` uses the recorded boards only.                                           |

---

## How it works

```
Browser (React + Vite)
   │  relative /api/...  ·  EventSource for the live stream
   ▼
Vite proxy (dev)  /  nginx + HTTPS (production)
   ▼
Express API :3001
   ├─ pipeline ──▶ Greenhouse public APIs (GET only, fixture fallback per board)
   │           ──▶ OpenAI-compatible chat API (only from apps/api/src/ai/)
   └─ Repo port ──▶ Firestore (Admin SDK, namespaced)  or  in-memory twin
```

1. `POST /api/runs` returns `202 { runId }`. A user can have one active Run; a second request gets `409`.
2. The browser opens `GET /api/runs/:runId/events` and receives a snapshot, then live deltas (D21).
3. **Discover**, then **skip seen** jobs (D15), then apply **hard blocks** in code (D7).
4. **Evaluate**: the AI returns evidence for each criterion; code computes the score and the verdict (D7, D8). No personal data goes to the model (D23).
5. **Apply**: fill each form field from the profile, the settings or AI-written text. A required field it can't answer holds the job as `needs_you` (D9–D11).
6. **Simulated submit** (D18). The first submit in each Run fails on purpose, and Retry succeeds (D19).

**Monorepo:** `packages/shared` holds the zod contract used at every boundary, `apps/api` is Express, and `apps/web` is React + MUI. The browser has no Firebase code and makes no AI calls.

---

## Commands

|                    |                                                                               |
| ------------------ | ----------------------------------------------------------------------------- |
| `npm run dev`      | API and web, using the `dev` namespace                                        |
| `npm run verify`   | Typecheck, lint and tests; run it before every commit                         |
| `npm test`         | Unit and integration tests (Vitest, Supertest, React Testing Library)         |
| `npm run test:e2e` | Playwright happy path, fully offline (`npx playwright install chromium` once) |
| `npm run build`    | Plain JS into each workspace's `dist/`                                        |

Tests never call a real job board or AI provider. The Firestore integration suite runs only when credentials are set; it uses a throwaway `test-<random>` namespace and deletes it afterwards. One contract suite runs against both repository implementations, so the in-memory twin can't drift from Firestore.

---

## Deployment

The live demo runs on EC2 with nginx, certbot and pm2. nginx serves `apps/web/dist` and proxies `/api` to the API on port 3001. The server installs production dependencies only (`npm ci --omit=dev`) and starts the API from `apps/api` with `npm start`. It reads `apps/api/.env` with `NODE_ENV=production`, `FIRESTORE_NAMESPACE=prod` and `CORS_ORIGIN=https://assignment.muthreja.com`.

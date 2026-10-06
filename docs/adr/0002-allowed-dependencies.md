# Allowed dependencies

This is the up-front allow-list the grilling produced. Anything on it may be installed in an unattended session without asking; anything **not** on it goes through the human dependency gate in `CLAUDE.md`. Exact versions are chosen at install time and pinned in the lockfile; Node `>=22` (dev on 26). We lean on the Node/browser platform (global `fetch`, `crypto.randomUUID`, native `EventSource`, `node --env-file`) instead of libraries wherever it is reasonable, and we deliberately pull in **no** AI-framework, state-machine, or concurrency library (see "Deliberately excluded").

## Runtime

### `packages/shared`
- **zod** — the contract: API payloads, SSE event payloads, Firestore document shapes, the status+reason unions, rubric constants.

### `apps/api`
- **express** — HTTP server.
- **firebase-admin** — Firestore access (Admin SDK only; browsers never touch Firebase).
- **zod** — boundary validation (shared).
- **jsonwebtoken** — sign/verify the auth JWT.
- **bcryptjs** — verify the password hash; pure JS so nothing native compiles in cloud sessions or on EC2 (D26). Ships its own types.
- **cookie-parser** — read the auth cookie (also on the SSE route).
- **cors** — exact-origin CORS with credentials (D27).
- **express-rate-limit** — rate-limit `POST /api/login` and `POST /api/runs` (D26, D28).

### `apps/web`
- **react**, **react-dom** — UI.
- **react-router-dom** — the routed pages: login, live run, Applied jobs, Scanned jobs, Settings (D20, D26).
- **@mui/material**, **@emotion/react**, **@emotion/styled** — the UI kit and its styling engine (ticket 05b, human-approved): one theme, plus accessible Table, Chip, Card and progress components, so a minimal UI looks designed without hand-rolled CSS.
- **@mui/icons-material** — the handful of icons in the shell and status chips.
- **@fontsource/inter** — Inter, self-hosted and bundled by Vite, so the page makes no requests to a font CDN.

## Dev / build / test
- **typescript** — strict everywhere; also the api/shared production build (`tsc`).
- **vite**, **@vitejs/plugin-react** — web dev server and production build.
- **vitest** — unit/integration tests across all workspaces.
- **jsdom** — DOM environment for component tests.
- **@testing-library/react**, **@testing-library/jest-dom**, **@testing-library/user-event** — component tests.
- **supertest** — API tests, including reading the SSE stream.
- **@playwright/test** — the one end-to-end happy-path spec.
- **tsx** — run the TypeScript API in development.
- **nodemon** — restart the API on change in development (D28).
- **concurrently** — run api + web together under `npm run dev`.
- **eslint**, **typescript-eslint**, **eslint-plugin-react-hooks** — linting.
- **prettier** — formatting.
- **Types**: `@types/node`, `@types/express`, `@types/cors`, `@types/cookie-parser`, `@types/jsonwebtoken`, `@types/supertest`, `@types/react`, `@types/react-dom`. (`bcryptjs` and `express-rate-limit` ship their own types.)

## Deliberately excluded (would need an ADR to add)
- **No AI SDK and no agent/RAG framework** — the AI is two schema-bound `fetch` calls to an OpenAI-compatible endpoint from `apps/api/src/ai/` (D22, D25); LangChain/LlamaIndex/vector stores are hook-blocked.
- **No state-machine library** (xstate) — the run/job machines are a centralised transition table of pure functions (D16).
- **No concurrency library** (p-limit) — the 3-in-flight pool is a tiny inline semaphore (D17).
- **No `node-fetch`, no `ulid`, no `uuid`** — covered by global `fetch` and `crypto.randomUUID`.
- **No `dotenv`** — `node --env-file` on Node ≥22 loads `.env`.
- **No client-side Firebase or AI key in `apps/web`** — hook-enforced.

# 01: Monorepo scaffold + contract skeleton + walking skeleton

**What to build:** A booting monorepo where the web app shows data fetched from the API. `npm run dev` starts both apps; `npm run verify` (typecheck + lint + test) passes on a trivial test. This is the tracer-bullet base every other ticket builds on.

**Blocked by:** None (can start immediately).

**Status:** done (commit ec1b85a)

- [x] npm workspaces with `apps/api`, `apps/web`, `packages/shared`; TypeScript strict everywhere; Node `>=22` engines.
- [x] `packages/shared` exports a `contract.ts` skeleton: the Run and Evaluation status enums, the `Limits` constants (`MAX_IN_FLIGHT = 3`, `MAX_AI_EVALS = 15`), and a shared error-response shape. All as zod schemas + inferred types.
- [x] `apps/api` is an Express server with one health route returning a contract-typed JSON shape; a small logger (no stray `console.log`).
- [x] `apps/web` is Vite + React + TS rendering one page that calls the health route and displays its result, with loading/error states.
- [x] Permissive **dev** CORS so web (5173) can call api (3001); tightened to exact-origin + credentials later (ticket 15).
- [x] Scripts wired: `dev` (api + web together), `typecheck`, `lint`, `test`, `verify`, `build`. One passing Vitest test exists so `verify` is green.
- [x] Only dependencies from ADR-0002 are used.

## Log
- Built in `ec1b85a` before this run; the Status line was never updated. Corrected by the 2026-10-06 /run-tickets audit (all bullets verified against the code). Since superseded as planned: the health check moved to the shell footer (`apps/web/src/shell/ApiHealth.tsx`, ticket 05b), and dev CORS became one exact origin with credentials (ticket 15).

# 13: Production readiness (build + env + README; deploy/ untouched)

**What to build:** The prototype is deployable by a human without surprises: the production build emits exactly what the existing `deploy/` scripts expect, every runtime variable is documented, and the README explains setup, architecture and testing. **`deploy/` is not edited by this ticket.**

**Blocked by:** 11, 12.

**Status:** done

- [ ] `npm run build` emits web → `apps/web/dist`, api → `apps/api/dist`, shared → `packages/shared/dist`, matching the paths the existing `deploy/deploy.sh` and the pm2 config consume. Verify by reading `deploy/` (read-only) — do not modify it.
- [x] `.env.example` lists **every** variable the server reads: `NODE_ENV`, `PORT`, `FIRESTORE_NAMESPACE`, `GOOGLE_APPLICATION_CREDENTIALS` / `FIREBASE_SERVICE_ACCOUNT_JSON`, the `AUTH_*` and `JWT_SECRET` and CORS origin vars, and the `AI_*` vars. Secrets never committed.
- [x] README skeleton: setup instructions, architecture explanation (the ports, the pipeline, SSE), and testing notes (the seams and how to run each suite, including the credential-gated Firestore suite).
- [x] The server runs plain `node` on the built files with production dependencies only; confirmed by a clean build + start locally.
- [ ] `deploy/` remains byte-for-byte unchanged.
- [x] **Production bug (added by the author, 2026-10-06):** the web build calls `http://localhost:3001` directly, so the deployed site (https://assignment.muthreja.com) fails with mixed-content errors. The web app must call the API with relative URLs (`/api/...`) in every build. Remove the localhost default; if a base-URL override is kept, it must default to empty.
- [x] In dev, the Vite dev-server proxy forwards `/api` (including the SSE stream, with no buffering) to `http://localhost:3001`.
- [x] A test asserts the production build (`apps/web/dist`) contains no "localhost".

## Log
- 2026-10-06 /run-tickets: first attempt (ticket-13) stopped by the author before any code change; restarted after ticket 11 merged, as the author asked. Merged branch ticket-13b (`deb4501`). Production bug fixed: every web call (runs, retry, me/updateMe, session, login, logout, health, SSE `EventSource`) uses relative `/api/...`; `VITE_API_URL` and the localhost default removed (web has no env vars). Vite dev proxy `/api` → `http://localhost:3001` in `apps/web/vite.config.ts`, curl-checked through :5173 (login cookie attributes intact; SSE headers, no compression, events streamed incrementally). `apps/web/src/production-build.test.ts` (in `npm run verify`, ~4 s) builds into a temp dir and fails on any "localhost" except react-router's exact literal `"http://localhost"` (an internal dummy URL base, never requested); orchestrator confirmed the real `apps/web/dist` has only those two react-router occurrences. `.env.example` checked by a new `config.test.ts` case against `CONFIG_KEYS` (now drives `loadConfig`); README.md created (setup, architecture, testing seams, build/start); production start verified with `npm ci --omit=dev` on the built files. Build paths match CLAUDE.md; `deploy/` is not in this repo, so the deploy cross-check could not be done (nothing created or touched there).
- Decisions: `apps/api` `npm start` = `node --env-file-if-exists=.env dist/index.js` (Node ≥22.9, cwd `apps/api`) — the human must check the pm2 config uses `npm start` or loads the env file itself. Dev cookie caveat: some Safari versions reject the `Secure` cookie on http://localhost (README notes it). Three page tests now resolve URLs against `location.origin`. No contract, dependency or lockfile changes. Browser check pending.
- 2026-10-06 final audit + fix pass (merged `e7aee7e` via fix-pass): the two `deploy/` bullets stay unticked: `deploy/` is not in this repo, so they cannot be verified. Fix pass: in production `CORS_ORIGIN` must now be set explicitly (the API refuses to start without it; dev/test keep the localhost default) — the server's `.env` must set it. `.prettierignore` added.

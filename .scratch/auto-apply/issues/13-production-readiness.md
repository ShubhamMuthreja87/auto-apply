# 13: Production readiness (build + env + README; deploy/ untouched)

**What to build:** The prototype is deployable by a human without surprises: the production build emits exactly what the existing `deploy/` scripts expect, every runtime variable is documented, and the README explains setup, architecture and testing. **`deploy/` is not edited by this ticket.**

**Blocked by:** 11, 12.

**Status:** ready-for-agent

- [ ] `npm run build` emits web → `apps/web/dist`, api → `apps/api/dist`, shared → `packages/shared/dist`, matching the paths the existing `deploy/deploy.sh` and the pm2 config consume. Verify by reading `deploy/` (read-only) — do not modify it.
- [ ] `.env.example` lists **every** variable the server reads: `NODE_ENV`, `PORT`, `FIRESTORE_NAMESPACE`, `GOOGLE_APPLICATION_CREDENTIALS` / `FIREBASE_SERVICE_ACCOUNT_JSON`, the `AUTH_*` and `JWT_SECRET` and CORS origin vars, and the `AI_*` vars. Secrets never committed.
- [ ] README skeleton: setup instructions, architecture explanation (the ports, the pipeline, SSE), and testing notes (the seams and how to run each suite, including the credential-gated Firestore suite).
- [ ] The server runs plain `node` on the built files with production dependencies only; confirmed by a clean build + start locally.
- [ ] `deploy/` remains byte-for-byte unchanged.
- [ ] **Production bug (added by the author, 2026-10-06):** the web build calls `http://localhost:3001` directly, so the deployed site (https://assignment.muthreja.com) fails with mixed-content errors. The web app must call the API with relative URLs (`/api/...`) in every build. Remove the localhost default; if a base-URL override is kept, it must default to empty.
- [ ] In dev, the Vite dev-server proxy forwards `/api` (including the SSE stream, with no buffering) to `http://localhost:3001`.
- [ ] A test asserts the production build (`apps/web/dist`) contains no "localhost".

# 15: Auth — login + JWT cookie + requireAuth layer + credentialed CORS

**What to build:** A login gate over the whole app and API. One user, a secure cookie, and the same cookie authenticating the SSE stream. Layered on top of the existing routes without changing their logic. (Cuttable: the core demo works without it.)

**Blocked by:** 12.

**Status:** ready-for-agent

- [ ] `POST /api/login` checks `AUTH_USERNAME` + `AUTH_PASSWORD_HASH` (bcryptjs, cost 12), signs a minimal **PII-free** JWT (`sub` = fixed uid, `iat`, 12 h `exp`) with `JWT_SECRET`, and sets it in an `httpOnly; Secure; SameSite=Strict` cookie. No signup.
- [ ] `requireAuth` middleware verifies the cookie on all `/api/*` except login and is **shared by the SSE route** (verify at connect only).
- [ ] `express-rate-limit` on `POST /api/login` and on `POST /api/runs`.
- [ ] CORS is tightened to exactly one origin from env, **with credentials** (never `*`), replacing the dev-permissive config from ticket 01. Works same-site in dev (5173↔3001) so the cookie rides the cross-origin SSE stream.
- [ ] Web: a login page and redirect-if-unauthenticated around the app shell; logout clears the cookie.
- [ ] HTTP-seam tests: protected route 401 without cookie, 200 with; the SSE stream authenticates off the cookie.
- [ ] Add this ticket's own variables (`AUTH_USERNAME`, `AUTH_PASSWORD_HASH`, `JWT_SECRET`, the CORS origin var) to `.env.example` and document them in the README — ticket 13 ran before this one, so they are not yet listed.

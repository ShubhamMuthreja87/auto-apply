# Persistence is chosen explicitly; no silent fallback

The API uses Firestore by default and refuses to start without a valid Firestore credential. The in-memory repository is used only when `REPO=memory` is set explicitly, and never with `NODE_ENV=production`. `GET /api/health` reports the active repository (`firestore` or `memory`) and the namespace, so nobody mistakes an in-memory demo for one that persists.

## Considered Options

- **Explicit `REPO=memory` (chosen).** A missing or mistyped credential is a boot error, not a quietly different system; the in-memory twin stays available for local demos and the end-to-end test by asking for it.
- **Fall back to in-memory when no credential is set.** Rejected: a dev or demo session could run for hours against a store that loses everything on restart, with nothing but a log line saying so.

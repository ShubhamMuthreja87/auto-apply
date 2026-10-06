# 05: Run lifecycle + SSE snapshot/delta + button & live Run view

**What to build:** The core of the product: press the button, a Run is created, and the browser watches it move through its statuses live. The pipeline here is a **skeleton over fake data** (no real discovery yet) so the end-to-end button→stream→completion path is demoable on its own. Login is deliberately *not* required yet (ticket 15 layers it on).

**Blocked by:** 02.

**Status:** done

- [x] `POST /api/runs` creates a Run and returns `202 { runId }`; a second active Run for the user returns `409`. Routes are thin (zod-parse → pipeline → HTTP); long work never blocks the request.
- [x] `GET /api/runs/:runId/events` is the SSE stream: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`. `app.set('trust proxy', 1)`.
- [x] On connect, await the first `watchRun` + `watchEvaluations` callbacks and coalesce into one named **`snapshot`** event (full Run + all Evaluations + funnel counts); then stream **`run`** and **`eval`** deltas; **heartbeat** comment every 15 s.
- [x] On terminal Run status: emit the terminal `run`, then **`done`**, then end the response. On `req.on('close')`: unsubscribe listeners and clear the heartbeat. No `Last-Event-ID`; every connect re-snapshots.
- [x] A `buildPipeline(deps)` composition root takes every port plus injected `clock`/`delay`; the skeleton pipeline transitions the Run `discovering → evaluating → applying → completed` over fake data.
- [x] Web: an Auto-apply button triggers the Run, opens the stream (`withCredentials: true`), and renders live Run status + funnel counts. Refresh/reconnect mid-Run loses nothing.
- [x] HTTP + SSE seam tests (Supertest + in-memory `Repo`): 202/409 and the `snapshot → run/eval → done` sequence.

## Notes (implementation)

Human-approved during implementation:
- `contract.ts` gained the run API and SSE payloads: `createRunResponse`, `activeRunResponse` (`GET /api/runs/active`, so a refresh reattaches), and the `snapshot` / `run` / `eval` / `done` / `error` events. Funnel counts travel in `snapshot.run.funnel`, not duplicated.
- `Repo.getRun` added (the stream answers 404 for unknown Runs).
- `Repo.watchEvaluations` now delivers batches with an always-present initial batch (ADR-0003), so the snapshot knows when it is complete.
- CORS allows exactly `CORS_ORIGIN` with credentials (D27), since `EventSource` `withCredentials` refuses `*`.

Deferred, deliberately:
- Interrupted-run sweep at boot → ticket 14. Until then, with Firestore, a restart mid-Run leaves that Run active and later POSTs get 409.
- Single transition function rejecting illegal status moves → ticket 07. The skeleton patches statuses directly.
- `JobEvaluator` / `ApplicationSubmitter` ports join `buildPipeline` with their tickets (08–11); only `JobSource` exists, backed by clearly-labelled placeholder Postings until ticket 06.

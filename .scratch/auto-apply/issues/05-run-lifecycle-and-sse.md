# 05: Run lifecycle + SSE snapshot/delta + button & live Run view

**What to build:** The core of the product: press the button, a Run is created, and the browser watches it move through its statuses live. The pipeline here is a **skeleton over fake data** (no real discovery yet) so the end-to-end button→stream→completion path is demoable on its own. Login is deliberately *not* required yet (ticket 15 layers it on).

**Blocked by:** 02.

**Status:** ready-for-agent

- [ ] `POST /api/runs` creates a Run and returns `202 { runId }`; a second active Run for the user returns `409`. Routes are thin (zod-parse → pipeline → HTTP); long work never blocks the request.
- [ ] `GET /api/runs/:runId/events` is the SSE stream: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`. `app.set('trust proxy', 1)`.
- [ ] On connect, await the first `watchRun` + `watchEvaluations` callbacks and coalesce into one named **`snapshot`** event (full Run + all Evaluations + funnel counts); then stream **`run`** and **`eval`** deltas; **heartbeat** comment every 15 s.
- [ ] On terminal Run status: emit the terminal `run`, then **`done`**, then end the response. On `req.on('close')`: unsubscribe listeners and clear the heartbeat. No `Last-Event-ID`; every connect re-snapshots.
- [ ] A `buildPipeline(deps)` composition root takes every port plus injected `clock`/`delay`; the skeleton pipeline transitions the Run `discovering → evaluating → applying → completed` over fake data.
- [ ] Web: an Auto-apply button triggers the Run, opens the stream (`withCredentials: true`), and renders live Run status + funnel counts. Refresh/reconnect mid-Run loses nothing.
- [ ] HTTP + SSE seam tests (Supertest + in-memory `Repo`): 202/409 and the `snapshot → run/eval → done` sequence.

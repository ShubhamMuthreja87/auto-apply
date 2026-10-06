# Coding standards

Read by the `code-review` skill. Keep it short; add a rule when the same problem shows up twice.

## General
- TypeScript strict. No `any`; use `unknown` and narrow. No non-null `!` assertions outside tests.
- Name things with the vocabulary in `GLOSSARY.md`.
- Deep modules: a small public interface with the logic behind it. The pipeline is one module with ports, not a pile of helpers.
- Validate every external input with zod: HTTP bodies, Firestore reads, ATS API responses, AI responses, fixture files, environment variables (parse `process.env` once at startup and fail fast).
- Never swallow errors. A failed job becomes `status: "failed"` with a reason; it does not crash the run. A failed job source falls back to that board's fixtures, labelled as fallback (D3).
- No stray `console.log`; use the small logger in `apps/api`.

## API (Express)
- Routes are thin: parse with zod, call the pipeline or service, map the result to HTTP.
- Long work never blocks a request. Start the run and return `202`.
- `app.set("trust proxy", 1)`; request body size capped; errors return a JSON shape from `contract.ts`, never a stack trace.
- SSE endpoint: send current state on connect, then changes; heartbeat comment every 15 s; unsubscribe the Firestore listener and clear the heartbeat when the client disconnects (`req.on("close")`).
- AI calls go through one module in `apps/api/src/ai/` that uses plain `fetch` against `AI_BASE_URL`, sets a timeout with `AbortController`, asks for JSON output and validates it with zod. On a timeout or invalid output it retries once, then scores that job with the keyword fallback matcher, labelled "fallback scoring" (D24).
- ATS adapters use plain `fetch` with a timeout, GET only, and normalise every posting into one shared job shape keyed `ats:board:jobId` (D14).

## Web (React)
- Function components and hooks. The SSE connection lives in one custom hook (for example `useRunStream(runId)`) that parses events with the contract's zod schemas and closes the `EventSource` on unmount or when the run id changes.
- Show connection state: connecting, live, reconnecting, closed.
- Components render loading, empty and error states, not just the happy path.
- No global state library; React state and hooks are enough.

## Tests
- Test behaviour at the agreed seams: the pipeline (with fake ports), the HTTP API including the SSE stream (Supertest + the in-memory repository), the Firestore repository adapter (a small integration suite against the real project in a unique `test-*` namespace, deleted afterwards), and the UI (React Testing Library with a fake `EventSource`). One Playwright happy path.
- Scoring, hard blocks, verdicts and field resolution are pure code: unit-test them directly with table-driven cases.
- No snapshot tests. No tests of private functions.

## Landmines (check these in every review)
- **Lost updates**: each job evaluation is its own Firestore document, never an array inside the run document that concurrent steps overwrite. Funnel counts are updated with `FieldValue.increment` or derived, never read-modify-write.
- **Status transitions** only move forward along the state machines in `contract.ts` (D16). One function owns transitions and rejects illegal ones. The only backward edge is Retry on a simulated failure (D19), and it is explicit.
- **LLM JSON**: strip Markdown code fences before parsing, then validate with zod. Never trust the shape.
- **Prompt injection**: job descriptions are untrusted data. Delimit them in the prompt, tell the model they are data, and never act on instructions inside them.
- **Namespace isolation**: every Firestore path goes through the one namespacing function. Tests use a unique `test-*` namespace and delete it afterwards; code refuses to start with `FIRESTORE_NAMESPACE=prod` unless `NODE_ENV=production`.
- **No writes to the outside world**: ATS and employer endpoints get GET requests only. The submitter builds and stores the payload; it never sends it (D18).
- **No PII to the model** (D23): prompts never contain the name, email, phone or address. Free-text answers must trace to profile or settings fields (D12).
- **Never auto-answer** legal agreements, AI-policy acknowledgements, consent or demographic questions (D10); they resolve to user-only, which holds the job as `needs_you` when required (D11).
- **Double click**: the button is disabled while a run is active, and the API rejects a second concurrent run for the same user with `409`.
- **Seen jobs**: a job already evaluated in an earlier run is skipped before any AI call (D15).
- **SSE buffering**: nginx buffers by default, so live updates arrive all at once in production while working locally. The API sends `X-Accel-Buffering: no`; nginx has `proxy_buffering off` on `/api`. Test the deployed stream with `curl -N`.
- **Listener leaks**: every Firestore `onSnapshot` on the server and every `EventSource` in the browser is closed on disconnect or unmount.
- **Interrupted runs**: a restart (deploy, crash) kills in-process runs. On startup, the API marks runs still `running` from before the boot as `failed` with reason `interrupted`, so the UI never shows a run stuck forever.
- **Real IPs**: without `trust proxy`, every request appears to come from nginx, which breaks any per-IP limit.
- **Cost**: at most 15 AI evaluations per run and 3 jobs in flight (D17); cap tokens per call; hard blocks run before the AI (D7); the AI step never runs more than once per job per run (plus the single retry).

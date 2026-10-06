# 09: AI client (real evaluator) + retry-then-fallback + scoredBy label

**What to build:** The real AI evaluator: per-criterion evidence from an OpenAI-compatible model, with the keyword matcher from ticket 08 as the safety net. The UI shows which Evaluations were AI-scored vs fallback.

**Blocked by:** 08.

**Status:** done

- [x] The AI client lives only in `apps/api/src/ai/`: plain `fetch` to `AI_BASE_URL`, `AbortController` timeout, asks for JSON, strips Markdown fences, validates with zod against the shared schema. Caps tokens per call.
- [x] Job descriptions are delimited and labelled as untrusted data in the prompt (prompt-injection defence); the model is never acted on for instructions inside them.
- [x] No PII in prompts (D23): never the name, email, phone or address. Free-text framing uses the job-title tier (EM vs Staff, D12) and answers must trace to profile/settings.
- [x] On timeout or invalid JSON: retry once, then fall back to the keyword matcher **for that Evaluation**. With no `AI_API_KEY`: the whole Run uses the matcher.
- [x] Each Evaluation records `scoredBy: 'ai' | 'fallback'`, surfaced in the UI as "fallback scoring" (D24).
- [x] **Adapter seam** tests drive the AI client with an injected `fetch` returning recorded real responses, plus malformed/timeout cases proving retry-then-fallback.

## Log
- 2026-10-06 /run-tickets: merged branch ticket-09 (`a80c8d4`) + follow-up fixing `scanned.test.ts` config (semantic clash with ticket 12). AI client `apps/api/src/ai/chat-client.ts` (plain fetch, AbortController timeout, JSON, fence strip, zod; retries once on timeout/invalid JSON/network/429/5xx, then `AiCallError`; other 4xx not retried; key only in the bearer header, never logged). Generic `completeJson` seam + `untrustedBlock`/`UNTRUSTED_DATA_RULE` (`ai/untrusted.ts`) for ticket 10. `ai-evaluator.ts` sends only the Posting + criteria (no user data, D23), Posting inside `<untrusted_job_posting>` with nested tags defused; failure after retry → keyword matcher, `scoredBy: 'fallback'`. Env `AI_PROVIDER`/`AI_BASE_URL`/`AI_MODEL`/`AI_API_KEY` + new `AI_TIMEOUT_MS` (20 s) in `ai/ai-env.ts`. No key → Run `scoring: "fallback"` and a Run-page warning. Tests added: `chat-client.test.ts` (10), `ai-evaluator.test.ts` (9), `scoring.test.ts` (3), 3 pipeline, 2 RunPanel, 1 contract. Contract (additive): `runSchema.scoring` (optional, `z.lazy` to `scoredBySchema`).
- Decisions: a "met" counts only if its quote appears in the Posting (case/space-insensitive), else not met; descriptions cut at 12,000 chars; output capped at 900 tokens; weights not sent to the model.
- Follow-up needed: `apps/api/fixtures/ai/*` are hand-written in DeepSeek's documented format, not real recordings (no key; real AI calls off-limits) — replace with real recordings. Browser check pending.
- 2026-10-06 final audit + fix pass (merged `e7aee7e` via fix-pass): the hand-written AI fixtures were replaced (author approved) by two real DeepSeek recordings made once on 2026-10-06 (`deepseek-chat`; served as `deepseek-flash`) on Anthropic job 5418402008: one evaluation, one "Why Anthropic?" free-text answer. Requests verified free of name/email/phone/address/links (by the script and by `recordings.test.ts`); no key or Authorization header saved. Tool kept as `npm run record:ai` (refuses without `--confirm-real-calls`; excluded from the build). Prompt changes now need a re-record (a test checks the recordings match today's prompts). Evaluation output cap raised 900 → 1,200 tokens.

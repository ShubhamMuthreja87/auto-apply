# 09: AI client (real evaluator) + retry-then-fallback + scoredBy label

**What to build:** The real AI evaluator: per-criterion evidence from an OpenAI-compatible model, with the keyword matcher from ticket 08 as the safety net. The UI shows which Evaluations were AI-scored vs fallback.

**Blocked by:** 08.

**Status:** ready-for-agent

- [ ] The AI client lives only in `apps/api/src/ai/`: plain `fetch` to `AI_BASE_URL`, `AbortController` timeout, asks for JSON, strips Markdown fences, validates with zod against the shared schema. Caps tokens per call.
- [ ] Job descriptions are delimited and labelled as untrusted data in the prompt (prompt-injection defence); the model is never acted on for instructions inside them.
- [ ] No PII in prompts (D23): never the name, email, phone or address. Free-text framing uses the job-title tier (EM vs Staff, D12) and answers must trace to profile/settings.
- [ ] On timeout or invalid JSON: retry once, then fall back to the keyword matcher **for that Evaluation**. With no `AI_API_KEY`: the whole Run uses the matcher.
- [ ] Each Evaluation records `scoredBy: 'ai' | 'fallback'`, surfaced in the UI as "fallback scoring" (D24).
- [ ] **Adapter seam** tests drive the AI client with an injected `fetch` returning recorded real responses, plus malformed/timeout cases proving retry-then-fallback.

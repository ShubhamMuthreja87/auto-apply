# Real AI recordings (`fixtures/ai`)

These files are **real recordings**, not hand-written. They were made on **2026-10-06** with exactly two calls to DeepSeek's chat-completions API, requested as model `deepseek-chat` (the provider reported the serving model as `deepseek-flash` in the response).

| File                               | What it is                                                                 |
| ---------------------------------- | -------------------------------------------------------------------------- |
| `deepseek-evaluation.json`         | Raw response body of one Posting evaluation (`src/ai/ai-evaluator.ts`)     |
| `deepseek-evaluation.request.json` | The request body that produced it (prompts only)                           |
| `deepseek-free-text.json`          | Raw response body of one free-text answer (`src/ai/free-text-answerer.ts`) |
| `deepseek-free-text.request.json`  | The request body that produced it (prompts only)                           |

- Input: Anthropic's "Engineering Manager, Business Technology" (Greenhouse job 5418402008), from the recorded board and form fixtures, with the seeded preferences and the redacted candidate facts (`src/ai/recording-inputs.ts`).
- No personal data: before each request was sent, the recording tool checked that it held none of the user's name, email, phone, address, location or links (D23). `recordings.test.ts` checks the saved requests again.
- No secrets: the API key travels only in the `Authorization` header, which is never saved, and the tool refuses to write a file that contains the key.
- Tests replay these files through an injected `fetch` (`recordings.test.ts`); no test calls a real endpoint. Other AI tests use small canned answers built in `src/ai/scripted-fetch.ts`.

To re-record (two real, billed calls; needs `AI_API_KEY`):

```sh
NODE_USE_ENV_PROXY=1 npm -w @auto-apply/api run record:ai -- --confirm-real-calls
```

`NODE_USE_ENV_PROXY=1` is only needed behind an HTTPS proxy. Without `--confirm-real-calls` the tool refuses to run.

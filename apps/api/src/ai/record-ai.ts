/**
 * `npm -w @auto-apply/api run record:ai -- --confirm-real-calls`
 *
 * Re-records the two real AI fixtures in `apps/api/fixtures/ai/` (ticket 09)
 * with exactly two calls to the configured provider (`AI_BASE_URL`,
 * `AI_MODEL`, `AI_API_KEY`): one Posting evaluation through the real
 * `ai-evaluator` prompt and one free-text answer through the real
 * `free-text-answerer` prompt, over the inputs in `recording-inputs.ts`.
 *
 * It spends real tokens, so it refuses to run without `--confirm-real-calls`.
 * Before each request leaves, it checks the body holds none of the user's
 * name, email, phone, address, location or links (D23) and aborts if it does.
 * It saves the raw response body and the request body (the prompts only; the
 * key travels in a header that is never saved), and refuses to write a file
 * that contains the key.
 */
import { writeFile } from "node:fs/promises";
import { aiEnvSchema } from "./ai-env.js";
import { createAiEvaluator } from "./ai-evaluator.js";
import { createChatClient } from "./chat-client.js";
import { createFreeTextAnswerer } from "./free-text-answerer.js";
import {
  personalStringsIn,
  recordedEvaluationCriteria,
  recordedFreeTextRequest,
  recordedPosting,
} from "./recording-inputs.js";
import { keywordMatcher } from "../evaluation/keyword-matcher.js";

const CONFIRM_FLAG = "--confirm-real-calls";
const FIXTURES = new URL("../../fixtures/ai/", import.meta.url);

function say(line: string): void {
  process.stdout.write(`${line}\n`);
}

interface Exchange {
  request: string;
  status: number;
  response: string;
}

/**
 * A `fetch` that allows exactly one call, checks its body for personal data
 * before sending it, and keeps the request and raw response bodies.
 */
function recordingFetch(exchanges: Exchange[]): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    if (exchanges.length > 0) throw new Error("record-ai: refusing a second call (no retries)");
    const body = typeof init?.body === "string" ? init.body : "";
    const leaked = personalStringsIn(body);
    if (leaked.length > 0) {
      throw new Error(
        `record-ai: request contains personal data (${leaked.length} items); not sent`,
      );
    }
    const res = await fetch(input, init);
    const response = await res.text();
    exchanges.push({ request: body, status: res.status, response });
    return new Response(response, { status: res.status, headers: res.headers });
  }) as typeof fetch;
}

async function save(name: string, exchange: Exchange, apiKey: string): Promise<void> {
  if (exchange.status !== 200) {
    throw new Error(`record-ai: ${name} answered HTTP ${exchange.status}; nothing saved`);
  }
  const request = JSON.stringify(JSON.parse(exchange.request), null, 2);
  for (const text of [request, exchange.response]) {
    if (text.includes(apiKey)) throw new Error(`record-ai: ${name} would save the key; aborted`);
  }
  await writeFile(new URL(`${name}.request.json`, FIXTURES), `${request}\n`);
  await writeFile(new URL(`${name}.json`, FIXTURES), exchange.response);
  say(`saved fixtures/ai/${name}.json and ${name}.request.json`);
}

async function main(): Promise<void> {
  if (!process.argv.includes(CONFIRM_FLAG)) {
    say(`record-ai makes two real, billed AI calls. Re-run with ${CONFIRM_FLAG} to proceed.`);
    process.exitCode = 1;
    return;
  }
  const env = aiEnvSchema.parse(process.env);
  const apiKey = env.AI_API_KEY;
  if (!apiKey) throw new Error("record-ai: AI_API_KEY is not set");
  say(`recording with ${env.AI_PROVIDER} ${env.AI_MODEL} at ${env.AI_BASE_URL}`);

  const chatFor = (exchanges: Exchange[]) =>
    createChatClient({
      fetch: recordingFetch(exchanges),
      baseUrl: env.AI_BASE_URL,
      model: env.AI_MODEL,
      apiKey,
      timeoutMs: 60_000,
      maxTokens: 1_000,
    });

  const evaluation: Exchange[] = [];
  const evaluator = createAiEvaluator({ chat: chatFor(evaluation), fallback: keywordMatcher });
  const judged = await evaluator.evaluate(await recordedPosting(), recordedEvaluationCriteria());
  const [evaluationExchange] = evaluation;
  if (!evaluationExchange || judged.scoredBy !== "ai") {
    throw new Error("record-ai: the evaluation call gave no usable answer; nothing saved");
  }
  await save("deepseek-evaluation", evaluationExchange, apiKey);

  const freeText: Exchange[] = [];
  const answerer = createFreeTextAnswerer({ chat: chatFor(freeText) });
  const answers = await answerer.answer(await recordedFreeTextRequest());
  const [freeTextExchange] = freeText;
  if (!freeTextExchange || answers.length === 0) {
    throw new Error("record-ai: the free-text call gave no usable answer; nothing saved");
  }
  await save("deepseek-free-text", freeTextExchange, apiKey);
}

main().catch((err: unknown) => {
  say(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});

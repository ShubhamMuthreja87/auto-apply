/**
 * The one way the API talks to a model (D22, D25): a schema-bound JSON call to
 * an OpenAI-compatible chat-completions endpoint with plain `fetch`. DeepSeek
 * by default; any compatible provider by changing `AI_BASE_URL`/`AI_MODEL`.
 *
 * Every call asks for JSON (`response_format: json_object`), caps its tokens,
 * aborts after `timeoutMs`, strips Markdown code fences from the answer and
 * validates it with the caller's zod schema (CODING_STANDARDS, LLM JSON). A
 * timeout, unparseable or wrongly shaped answer, network error, 429 or 5xx is
 * retried once; then it throws {@link AiCallError} and the caller falls back
 * (D24). A rejected request (any other 4xx, e.g. a bad key) is not retried.
 *
 * Callers own their prompts. Two use this: Posting evaluation
 * (`ai-evaluator.ts`) and free-text form answers (`free-text-answerer.ts`).
 */
import { z } from "zod";
import { messageOf } from "../errors.js";

export interface ChatClientOptions {
  fetch: typeof fetch;
  /** e.g. `https://api.deepseek.com`; `/chat/completions` is appended. */
  baseUrl: string;
  model: string;
  /** Sent only as the bearer token; never logged or put in an error. */
  apiKey: string;
  timeoutMs: number;
  /** Default `max_tokens` per call. */
  maxTokens: number;
}

/** One schema-bound request: the prompts, and the shape the answer must have. */
export interface JsonRequest<T> {
  system: string;
  user: string;
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  /** Overrides the client's default token cap for this call. */
  maxTokens?: number;
}

export interface ChatClient {
  /** The validated answer; throws {@link AiCallError} after the one retry. */
  completeJson<T>(request: JsonRequest<T>): Promise<T>;
}

export type AiCallErrorKind = "timeout" | "network" | "http" | "invalid_output";

/** Why a model call gave no usable answer. Its message never contains the key. */
export class AiCallError extends Error {
  constructor(
    readonly kind: AiCallErrorKind,
    message: string,
    /** Whether trying again might help. */
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "AiCallError";
  }
}

/** The part of a chat completion we read; providers send more. */
const completionSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).min(1),
});

/** Removes a surrounding ```json … ``` (or bare ```) fence, if any. */
export function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```[a-zA-Z0-9_-]*\s*\n?([\s\S]*?)\n?\s*```$/.exec(trimmed);
  return fenced?.[1] !== undefined ? fenced[1].trim() : trimmed;
}

function endpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

export function createChatClient(options: ChatClientOptions): ChatClient {
  const url = endpoint(options.baseUrl);

  async function post(body: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      return await options.fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${options.apiKey}`,
        },
        body,
        signal: controller.signal,
      });
    } catch (err) {
      if (controller.signal.aborted) {
        throw new AiCallError("timeout", `AI call timed out after ${options.timeoutMs} ms`, true);
      }
      const reason = messageOf(err);
      throw new AiCallError("network", `AI call failed: ${reason}`, true);
    } finally {
      clearTimeout(timer);
    }
  }

  async function attempt<T>(request: JsonRequest<T>): Promise<T> {
    const body = JSON.stringify({
      model: options.model,
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: request.user },
      ],
      response_format: { type: "json_object" },
      max_tokens: request.maxTokens ?? options.maxTokens,
      temperature: 0,
      stream: false,
    });
    const response = await post(body);
    if (!response.ok) {
      // The body is not echoed: a provider may quote the request's key back.
      const retryable = response.status === 429 || response.status >= 500;
      throw new AiCallError("http", `AI call returned HTTP ${response.status}`, retryable);
    }
    const envelope = completionSchema.safeParse(await response.json().catch(() => null));
    if (!envelope.success) {
      throw new AiCallError("invalid_output", "AI response is not a chat completion", true);
    }
    const content = envelope.data.choices[0]?.message.content ?? "";
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripCodeFences(content));
    } catch {
      throw new AiCallError("invalid_output", "AI answer is not valid JSON", true);
    }
    const answer = request.schema.safeParse(parsed);
    if (!answer.success) {
      throw new AiCallError("invalid_output", "AI answer does not match the expected shape", true);
    }
    return answer.data;
  }

  return {
    async completeJson(request) {
      try {
        return await attempt(request);
      } catch (err) {
        if (err instanceof AiCallError && err.retryable) return attempt(request);
        throw err;
      }
    },
  };
}

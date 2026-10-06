/**
 * Test support: a `fetch` that answers chat-completion requests from a script,
 * one step per call, so AI-client tests never touch a real endpoint. A step is
 * a response body (sent as `200` JSON), a `Response`, or `"hang"`, which never
 * answers and rejects only when the caller aborts (a timeout). Every request is
 * kept in `calls` with its parsed JSON body.
 */
import { readFile } from "node:fs/promises";

export type ScriptStep = unknown;
export const HANG = "hang";

export interface ScriptedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

export interface ScriptedFetch {
  fetch: typeof fetch;
  calls: ScriptedCall[];
}

export function scriptedFetch(steps: ScriptStep[]): ScriptedFetch {
  const calls: ScriptedCall[] = [];
  const fake = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : undefined,
    });
    const step = steps[calls.length - 1];
    if (step === undefined) throw new Error(`scriptedFetch: no step for call ${calls.length}`);
    if (step === HANG) {
      return new Promise<Response>((_, reject) => {
        const signal = init?.signal;
        signal?.addEventListener("abort", () =>
          reject(new DOMException("The operation was aborted.", "AbortError")),
        );
      });
    }
    if (step instanceof Response) return step;
    return new Response(JSON.stringify(step), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  return { fetch: fake as typeof fetch, calls };
}

/**
 * A real provider response body recorded by `record-ai.ts` (see
 * `apps/api/fixtures/ai/README-recordings.md`), or its request body with
 * `name` ending in `.request`.
 */
export async function readAiFixture(name: string): Promise<unknown> {
  const file = new URL(`../../fixtures/ai/${name}.json`, import.meta.url);
  return JSON.parse(await readFile(file, "utf8")) as unknown;
}

/** A chat completion whose assistant message is `content`. */
export function completion(content: string): unknown {
  return {
    id: "canned",
    object: "chat.completion",
    created: 0,
    model: "deepseek-chat",
    choices: [
      { index: 0, message: { role: "assistant", content }, finish_reason: "stop", logprobs: null },
    ],
  };
}

/** The judgements the canned evaluation answers with, for the synthetic test posting. */
export const CANNED_JUDGEMENTS = {
  judgements: [
    {
      criterionId: "stack_primary",
      met: true,
      evidence: "Our stack is TypeScript, Node.js and React",
    },
    { criterionId: "startup", met: false, evidence: "" },
  ],
};

/** A hand-written evaluation answer in the provider envelope (not a recording). */
export function cannedEvaluation(): unknown {
  return completion(JSON.stringify(CANNED_JUDGEMENTS));
}

/** The same answer wrapped in a Markdown code fence, as some models reply. */
export function cannedEvaluationFenced(): unknown {
  return completion(`\`\`\`json\n${JSON.stringify(CANNED_JUDGEMENTS)}\n\`\`\``);
}

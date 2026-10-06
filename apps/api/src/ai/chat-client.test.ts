import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AiCallError, createChatClient, type ChatClientOptions } from "./chat-client.js";
import { HANG, cannedEvaluation, cannedEvaluationFenced, completion, scriptedFetch } from "./scripted-fetch.js";

// Canned answers in DeepSeek's chat-completion envelope; the real recordings
// in `apps/api/fixtures/ai` are replayed in `recordings.test.ts`. No real
// endpoint is ever called.

const judgementsSchema = z.object({
  judgements: z.array(
    z.object({ criterionId: z.string(), met: z.boolean(), evidence: z.string() }),
  ),
});

const request = {
  system: "You judge postings. Answer in JSON.",
  user: "Judge this.",
  schema: judgementsSchema,
};

const SECRET = "sk-test-not-a-real-key";

function client(fetch: typeof globalThis.fetch, overrides: Partial<ChatClientOptions> = {}) {
  return createChatClient({
    fetch,
    baseUrl: "https://ai.example.test",
    model: "deepseek-chat",
    apiKey: SECRET,
    timeoutMs: 50,
    maxTokens: 700,
    ...overrides,
  });
}

const expected = {
  judgements: [
    {
      criterionId: "stack_primary",
      met: true,
      evidence: "Our stack is TypeScript, Node.js and React",
    },
    { criterionId: "startup", met: false, evidence: "" },
  ],
};

describe("chat client (adapter seam, injected fetch)", () => {
  it("POSTs one JSON-mode, token-capped chat completion and returns the validated answer", async () => {
    const fake = scriptedFetch([cannedEvaluation()]);

    const answer = await client(fake.fetch).completeJson(request);

    expect(answer).toEqual(expected);
    expect(fake.calls).toHaveLength(1);
    const [call] = fake.calls;
    expect(call?.url).toBe("https://ai.example.test/chat/completions");
    expect(call?.method).toBe("POST");
    expect(call?.headers.authorization).toBe(`Bearer ${SECRET}`);
    expect(call?.body).toEqual({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: request.user },
      ],
      response_format: { type: "json_object" },
      max_tokens: 700,
      temperature: 0,
      stream: false,
    });
  });

  it("tolerates a trailing slash on the base URL", async () => {
    const fake = scriptedFetch([cannedEvaluation()]);
    await client(fake.fetch, { baseUrl: "https://ai.example.test/v1/" }).completeJson(request);
    expect(fake.calls[0]?.url).toBe("https://ai.example.test/v1/chat/completions");
  });

  it("strips Markdown code fences before parsing", async () => {
    const fake = scriptedFetch([cannedEvaluationFenced()]);
    await expect(client(fake.fetch).completeJson(request)).resolves.toEqual(expected);
  });

  it("retries once after invalid JSON and returns the second answer", async () => {
    const fake = scriptedFetch([
      completion("Sure! Here are the judgements: stack_primary is met."),
      cannedEvaluation(),
    ]);
    await expect(client(fake.fetch).completeJson(request)).resolves.toEqual(expected);
    expect(fake.calls).toHaveLength(2);
  });

  it("retries once after a timeout and returns the second answer", async () => {
    const fake = scriptedFetch([HANG, cannedEvaluation()]);
    await expect(client(fake.fetch).completeJson(request)).resolves.toEqual(expected);
    expect(fake.calls).toHaveLength(2);
  });

  it("gives up after the one retry with an AiCallError naming the cause", async () => {
    const fake = scriptedFetch([HANG, HANG, HANG]);
    const error = await client(fake.fetch)
      .completeJson(request)
      .catch((err: unknown) => err);
    expect(error).toBeInstanceOf(AiCallError);
    expect((error as AiCallError).kind).toBe("timeout");
    expect(fake.calls).toHaveLength(2);
  });

  it("treats JSON of the wrong shape like invalid JSON", async () => {
    const wrong = completion(JSON.stringify({ judgements: [{ criterionId: "x", met: "yes" }] }));
    const fake = scriptedFetch([wrong, wrong]);
    const error = await client(fake.fetch)
      .completeJson(request)
      .catch((err: unknown) => err);
    expect((error as AiCallError).kind).toBe("invalid_output");
    expect(fake.calls).toHaveLength(2);
  });

  it("retries a 5xx or 429 once", async () => {
    const fake = scriptedFetch([
      new Response("busy", { status: 503 }),
      cannedEvaluation(),
    ]);
    await expect(client(fake.fetch).completeJson(request)).resolves.toEqual(expected);
  });

  it("does not retry a rejected request (401), and never puts the key in the error", async () => {
    const fake = scriptedFetch([
      new Response(JSON.stringify({ error: { message: `Invalid key ${SECRET}` } }), {
        status: 401,
      }),
    ]);
    const error = await client(fake.fetch)
      .completeJson(request)
      .catch((err: unknown) => err);
    expect((error as AiCallError).kind).toBe("http");
    expect((error as AiCallError).message).toContain("401");
    expect((error as AiCallError).message).not.toContain(SECRET);
    expect(fake.calls).toHaveLength(1);
  });

  it("rejects a response that is not a chat completion", async () => {
    const fake = scriptedFetch([{ hello: "world" }, { hello: "world" }]);
    const error = await client(fake.fetch)
      .completeJson(request)
      .catch((err: unknown) => err);
    expect((error as AiCallError).kind).toBe("invalid_output");
  });
});

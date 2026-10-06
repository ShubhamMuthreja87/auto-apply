/**
 * Replays the two real DeepSeek recordings (ticket 09, made by `record-ai.ts`)
 * through the real evaluator and free-text answerer. The requests our code
 * builds today must still be the ones that were recorded; if a prompt
 * changes, re-record with `npm -w @auto-apply/api run record:ai`.
 */
import { describe, expect, it } from "vitest";
import { keywordMatcher } from "../evaluation/keyword-matcher.js";
import { createAiEvaluator } from "./ai-evaluator.js";
import { createChatClient } from "./chat-client.js";
import { createFreeTextAnswerer } from "./free-text-answerer.js";
import {
  personalStringsIn,
  recordedEvaluationCriteria,
  recordedFreeTextRequest,
  recordedPosting,
} from "./recording-inputs.js";
import { readAiFixture, scriptedFetch } from "./scripted-fetch.js";

function chatOver(recording: unknown) {
  const fake = scriptedFetch([recording]);
  const chat = createChatClient({
    fetch: fake.fetch,
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-chat",
    apiKey: "sk-test",
    timeoutMs: 1_000,
    maxTokens: 1_000,
  });
  return { chat, fake };
}

/** The messages of a request body, recorded or sent. */
function messagesOf(body: unknown): unknown {
  return (body as { messages: unknown }).messages;
}

describe("real recording: Posting evaluation (deepseek-chat, 2026-10-06)", () => {
  it("was made from a request with no name, contact details, address or links (D23)", async () => {
    const request = JSON.stringify(await readAiFixture("deepseek-evaluation.request"));
    expect(personalStringsIn(request)).toEqual([]);
  });

  it("is still the request the evaluator builds today", async () => {
    const { chat, fake } = chatOver(await readAiFixture("deepseek-evaluation"));
    await createAiEvaluator({ chat, fallback: keywordMatcher }).evaluate(
      await recordedPosting(),
      recordedEvaluationCriteria(),
    );

    const recorded = await readAiFixture("deepseek-evaluation.request");
    expect(messagesOf(fake.calls[0]?.body)).toEqual(messagesOf(recorded));
  });

  it("parses into a verified judgement for every criterion asked, labelled ai", async () => {
    const posting = await recordedPosting();
    const criteria = recordedEvaluationCriteria();
    const { chat } = chatOver(await readAiFixture("deepseek-evaluation"));

    const { scoredBy, judgements } = await createAiEvaluator({
      chat,
      fallback: keywordMatcher,
    }).evaluate(posting, criteria);

    expect(scoredBy).toBe("ai");
    expect(judgements.map((j) => j.criterionId).sort()).toEqual(criteria.map((c) => c.id).sort());
    const met = judgements.filter((j) => j.met).map((j) => j.criterionId);
    // The model's real answer for Anthropic's EM, Business Technology posting.
    expect(met).toEqual(expect.arrayContaining(["hands_on_leadership", "llm_features"]));
    expect(met).not.toContain("stack_primary");
    // No language gate question was met: a manager title, and no gated primary stack.
    expect(met.some((id) => id.startsWith("gate:"))).toBe(false);
    for (const judgement of judgements.filter((j) => j.met)) {
      expect(judgement.evidence.length).toBeGreaterThan(0);
    }
  });
});

describe("real recording: free-text answer (deepseek-chat, 2026-10-06)", () => {
  it("was made from a request with no name, contact details, address or links (D23)", async () => {
    const request = JSON.stringify(await readAiFixture("deepseek-free-text.request"));
    expect(personalStringsIn(request)).toEqual([]);
  });

  it("is still the request the answerer builds today", async () => {
    const { chat, fake } = chatOver(await readAiFixture("deepseek-free-text"));
    await createFreeTextAnswerer({ chat }).answer(await recordedFreeTextRequest());

    const recorded = await readAiFixture("deepseek-free-text.request");
    expect(messagesOf(fake.calls[0]?.body)).toEqual(messagesOf(recorded));
  });

  it("answers the required free-text question, grounded only in the given facts (D12)", async () => {
    const request = await recordedFreeTextRequest();
    const { chat } = chatOver(await readAiFixture("deepseek-free-text"));

    const answers = await createFreeTextAnswerer({ chat }).answer(request);

    expect(answers.map((a) => a.fieldId)).toEqual(request.questions.map((q) => q.fieldId));
    const factIds = new Set(request.facts.map((f) => f.id));
    for (const answer of answers) {
      expect(answer.answer.trim().length).toBeGreaterThan(0);
      expect(answer.basedOn.length).toBeGreaterThan(0);
      expect(answer.basedOn.every((id) => factIds.has(id))).toBe(true);
      expect(personalStringsIn(answer.answer)).toEqual([]);
    }
  });
});

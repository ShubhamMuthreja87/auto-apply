import { describe, expect, it } from "vitest";
import type { FitCriterion, Posting } from "@auto-apply/shared";
import { loadConfig } from "../config.js";
import { TEST_AUTH_ENV } from "../auth/test-auth.js";
import { createScoring } from "./scoring.js";
import { cannedEvaluation, scriptedFetch } from "./scripted-fetch.js";

const posting: Posting = {
  ats: "greenhouse",
  board: "acme",
  jobId: "1",
  title: "Senior Engineer",
  company: "Acme",
  location: "Remote",
  descriptionText: "Our stack is TypeScript, Node.js and React at a startup.",
  applyUrl: "https://boards.greenhouse.io/acme/jobs/1",
  remote: true,
  source: "live",
};
const criteria: FitCriterion[] = [
  {
    id: "stack_primary",
    label: "JS/TS/Node/React is the primary stack",
    weight: 3,
    group: "stack",
    terms: ["TypeScript"],
    source: "Stack: +3 JS/TS/Node/React primary",
  },
];

describe("createScoring (composition of the AI env, D22/D24)", () => {
  it("with no AI_API_KEY, the whole Run uses fallback scoring and never calls fetch", async () => {
    const fake = scriptedFetch([]);
    const scoring = createScoring(loadConfig({ ...TEST_AUTH_ENV, AI_API_KEY: "  " }), fake.fetch);

    expect(scoring.mode).toBe("fallback");
    const result = await scoring.evaluator.evaluate(posting, criteria);
    expect(result.scoredBy).toBe("fallback");
    expect(scoring.chat).toBeNull();
    expect(fake.calls).toHaveLength(0);
  });

  it("with a key, scores with the AI at AI_BASE_URL using AI_MODEL", async () => {
    const fake = scriptedFetch([cannedEvaluation()]);
    const config = loadConfig({
      ...TEST_AUTH_ENV,
      AI_API_KEY: "sk-test",
      AI_BASE_URL: "https://llm.example.test/v1",
      AI_MODEL: "some-model",
    });
    const scoring = createScoring(config, fake.fetch);

    expect(scoring.mode).toBe("ai");
    expect(scoring.chat).not.toBeNull();
    const result = await scoring.evaluator.evaluate(posting, criteria);
    expect(result.scoredBy).toBe("ai");
    expect(fake.calls[0]?.url).toBe("https://llm.example.test/v1/chat/completions");
    expect(fake.calls[0]?.body).toMatchObject({ model: "some-model" });
  });

  it("defaults to DeepSeek and rejects a malformed base URL at startup", () => {
    const config = loadConfig({ ...TEST_AUTH_ENV });
    expect(config.AI_PROVIDER).toBe("deepseek");
    expect(config.AI_BASE_URL).toBe("https://api.deepseek.com");
    expect(config.AI_MODEL).toBe("deepseek-chat");
    expect(config.AI_API_KEY).toBeUndefined();
    expect(() => loadConfig({ ...TEST_AUTH_ENV, AI_BASE_URL: "not a url" })).toThrow();
  });
});

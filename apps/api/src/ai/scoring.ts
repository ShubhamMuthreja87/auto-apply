/**
 * Chooses how a Run scores Postings (D22, D24), from the parsed env: with an
 * `AI_API_KEY`, the AI evaluator (each Posting falling back to the keyword
 * matcher if the model fails it); without one, the keyword matcher for the
 * whole Run, which the UI labels "fallback scoring".
 *
 * It also hands out the configured chat client (or `null` with no key) for
 * the other schema-bound call, AI free-text form answers.
 */
import type { ScoredBy } from "@auto-apply/shared";
import type { Config } from "../config.js";
import { keywordMatcher } from "../evaluation/keyword-matcher.js";
import { logger } from "../logger.js";
import type { JobEvaluator } from "../pipeline/ports.js";
import { createAiEvaluator } from "./ai-evaluator.js";
import { createChatClient, type ChatClient } from "./chat-client.js";

/** Default output-token cap per call; callers may lower or raise it per call. */
const DEFAULT_MAX_TOKENS = 1_000;

export interface Scoring {
  /** `fallback` when no key is configured, so every Posting uses the matcher. */
  mode: ScoredBy;
  evaluator: JobEvaluator;
  chat: ChatClient | null;
}

export function createScoring(config: Config, fetchImpl: typeof fetch): Scoring {
  if (!config.AI_API_KEY) {
    logger.warn("ai_disabled", { reason: "no AI_API_KEY; every Run uses fallback scoring" });
    return { mode: "fallback", evaluator: keywordMatcher, chat: null };
  }
  const chat = createChatClient({
    fetch: fetchImpl,
    baseUrl: config.AI_BASE_URL,
    model: config.AI_MODEL,
    apiKey: config.AI_API_KEY,
    timeoutMs: config.AI_TIMEOUT_MS,
    maxTokens: DEFAULT_MAX_TOKENS,
  });
  logger.info("ai_enabled", { provider: config.AI_PROVIDER, model: config.AI_MODEL });
  return { mode: "ai", evaluator: createAiEvaluator({ chat, fallback: keywordMatcher }), chat };
}

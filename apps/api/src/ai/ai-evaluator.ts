/**
 * The AI `JobEvaluator` (D7, D22): asks the model, per AI-side rubric
 * criterion, whether a Posting meets it and for a verbatim quote as evidence.
 * No score and no Verdict; code computes those (`evaluation/score.ts`).
 *
 * The prompt holds only the Posting and the criteria — never the user's name,
 * contact details or address (D23), which this module is never given. The
 * Posting is delimited and labelled as untrusted data. A "met" whose quote is
 * not in the Posting does not count, so every point traces to real text.
 *
 * When the model gives no usable answer after the chat client's one retry,
 * this Posting is judged by the fallback (the keyword matcher) and labelled
 * `fallback` (D24); the Run carries on.
 */
import { z } from "zod";
import type { FitCriterion, Posting } from "@auto-apply/shared";
import { logger } from "../logger.js";
import type { CriterionJudgement, JobEvaluator } from "../pipeline/ports.js";
import { AiCallError, type ChatClient } from "./chat-client.js";
import { UNTRUSTED_DATA_RULE, untrustedBlock } from "./untrusted.js";

/** Description characters sent per Posting; keeps each call's tokens bounded. */
export const MAX_DESCRIPTION_CHARS = 12_000;
/** Output tokens per evaluation: ~13 criteria (rubric plus language gate) with a short quote each. */
export const EVALUATION_MAX_TOKENS = 1_200;

const answerSchema = z.object({
  judgements: z.array(
    z.object({
      criterionId: z.string(),
      met: z.boolean(),
      evidence: z.string().max(600),
    }),
  ),
});

const SYSTEM_PROMPT = [
  "You assess one job posting against a candidate's fit criteria.",
  "For each criterion decide whether the posting clearly meets it.",
  'When it does, set "met": true and copy a short verbatim quote (at most 160 characters) from the posting as "evidence".',
  'When it does not, or the posting does not say, set "met": false and "evidence": "".',
  "Anything the posting has not stated (location, pay, company size, stack, experience) is unknown: never assume it, and an unknown criterion is not met.",
  "Do not score, rank or recommend; only judge each criterion.",
  UNTRUSTED_DATA_RULE,
  'Reply with JSON only, in this shape: {"judgements":[{"criterionId":"<id>","met":true,"evidence":"<quote>"}]}, one entry per criterion.',
].join("\n");

function userPrompt(posting: Posting, criteria: readonly FitCriterion[]): string {
  const criteriaJson = JSON.stringify(
    criteria.map(({ id, label, source }) => ({ id, label, from: source })),
    null,
    2,
  );
  const text = posting.descriptionText.trim();
  const description =
    text === ""
      ? "(no description provided)"
      : text.length > MAX_DESCRIPTION_CHARS
        ? `${text.slice(0, MAX_DESCRIPTION_CHARS)}…`
        : text;
  const stated = (value: string) => value.trim() || "(not stated)";
  const postingText = [
    `Title: ${stated(posting.title)}`,
    `Company: ${stated(posting.company)}`,
    `Location: ${stated(posting.location)}`,
    "",
    description,
  ].join("\n");
  return [
    "Criteria (from the candidate's own job-search rules):",
    criteriaJson,
    "",
    "The job posting:",
    untrustedBlock("job_posting", postingText),
  ].join("\n");
}

/** Lowercase with whitespace runs collapsed and ellipses trimmed. */
function normalise(text: string): string {
  return text
    .replace(/^(…|\.\.\.)|(…|\.\.\.)$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** A "met" counts only with a quote found in the Posting (D7: every point traces to a quote). */
function verified(posting: Posting, judgement: CriterionJudgement): CriterionJudgement {
  if (!judgement.met) return { ...judgement, evidence: "" };
  const quote = normalise(judgement.evidence);
  const haystack = normalise(`${posting.title}\n${posting.descriptionText}`);
  if (quote.length > 0 && haystack.includes(quote)) return judgement;
  return { criterionId: judgement.criterionId, met: false, evidence: "" };
}

export interface AiEvaluatorDeps {
  chat: ChatClient;
  /** Judges a Posting the model could not (D24): the keyword matcher. */
  fallback: JobEvaluator;
}

export function createAiEvaluator({ chat, fallback }: AiEvaluatorDeps): JobEvaluator {
  return {
    async evaluate(posting, criteria) {
      let answer: z.infer<typeof answerSchema>;
      try {
        answer = await chat.completeJson({
          system: SYSTEM_PROMPT,
          user: userPrompt(posting, criteria),
          schema: answerSchema,
          maxTokens: EVALUATION_MAX_TOKENS,
        });
      } catch (err) {
        if (!(err instanceof AiCallError)) throw err;
        logger.warn("ai_evaluation_fallback", {
          jobId: posting.jobId,
          board: posting.board,
          kind: err.kind,
          reason: err.message,
        });
        return fallback.evaluate(posting, criteria);
      }
      const asked = new Set(criteria.map((c) => c.id));
      const answered = answer.judgements.filter((j) => asked.has(j.criterionId));
      const judgements = answered.map((j) => verified(posting, j));
      const unverified = answered.filter((j, i) => j.met && !judgements[i]?.met).length;
      if (unverified > 0) {
        logger.warn("ai_quotes_not_found", {
          jobId: posting.jobId,
          board: posting.board,
          unverified,
        });
      }
      return { scoredBy: "ai", judgements };
    },
  };
}

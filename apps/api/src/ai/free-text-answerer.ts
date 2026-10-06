/**
 * The AI `FreeTextAnswerer` (D9, D12, D22): drafts answers to an application
 * form's required free-text questions from the candidate's facts only.
 *
 * The prompt holds the facts (built PII-free by `forms/candidate-facts.ts`,
 * D23), the tier framing, the Posting and the questions; the Posting and the
 * questions are third-party text, delimited as untrusted data. The model
 * must cite the fact ids each answer rests on and leave out any question
 * the facts do not answer; the caller drops answers that cite nothing it was
 * given. When the model gives no usable answer after the chat client's one
 * retry, it answers nothing and those fields fall to the user.
 */
import { z } from "zod";
import { logger } from "../logger.js";
import type { FreeTextAnswer, FreeTextAnswerer, FreeTextRequest } from "../pipeline/ports.js";
import { AiCallError, type ChatClient } from "./chat-client.js";
import { UNTRUSTED_DATA_RULE, untrustedBlock } from "./untrusted.js";

/** Description characters sent per Posting; keeps the call's tokens bounded. */
const MAX_DESCRIPTION_CHARS = 6_000;
/** Output tokens per form: a few short answers. */
export const FREE_TEXT_MAX_TOKENS = 1_200;

const answerSchema = z.object({
  answers: z.array(
    z.object({
      fieldId: z.string(),
      answer: z.string().max(2_000),
      basedOn: z.array(z.string()),
    }),
  ),
});

const SYSTEM_PROMPT = [
  "You draft answers to a job application's free-text questions for a candidate.",
  "Use only the candidate facts provided. Never invent experience, dates, notice periods, visa status, salary or anything else they do not state.",
  "If the facts do not answer a question, leave that question out.",
  "Write in the first person, plainly and briefly (at most 120 words per answer), with the framing given.",
  'For each answer list in "basedOn" the ids of the facts it uses.',
  UNTRUSTED_DATA_RULE,
  'Reply with JSON only, in this shape: {"answers":[{"fieldId":"<id>","answer":"<text>","basedOn":["<fact id>"]}]}.',
].join("\n");

const FRAMING: Record<FreeTextRequest["framing"], string> = {
  EM: "EM: present the candidate as an engineering manager who leads teams and delivery.",
  Staff:
    "Staff: present the candidate as a staff-level individual contributor who leads technically.",
};

function userPrompt(request: FreeTextRequest): string {
  const { posting } = request;
  const description =
    posting.descriptionText.length > MAX_DESCRIPTION_CHARS
      ? `${posting.descriptionText.slice(0, MAX_DESCRIPTION_CHARS)}…`
      : posting.descriptionText;
  const questions = request.questions
    .map((q) =>
      [
        `fieldId: ${q.fieldId}`,
        `Question: ${q.label}`,
        q.description && `Details: ${q.description}`,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
  return [
    `Framing: ${FRAMING[request.framing]}`,
    "",
    "Candidate facts:",
    JSON.stringify(request.facts, null, 2),
    "",
    "The job:",
    untrustedBlock(
      "job_posting",
      [`Title: ${posting.title}`, `Company: ${posting.company}`, "", description].join("\n"),
    ),
    "",
    "The questions to answer:",
    untrustedBlock("form_questions", questions),
  ].join("\n");
}

export function createFreeTextAnswerer({ chat }: { chat: ChatClient }): FreeTextAnswerer {
  return {
    async answer(request): Promise<FreeTextAnswer[]> {
      let reply: z.infer<typeof answerSchema>;
      try {
        reply = await chat.completeJson({
          system: SYSTEM_PROMPT,
          user: userPrompt(request),
          schema: answerSchema,
          maxTokens: FREE_TEXT_MAX_TOKENS,
        });
      } catch (err) {
        if (!(err instanceof AiCallError)) throw err;
        logger.warn("ai_free_text_unavailable", {
          jobId: request.posting.jobId,
          board: request.posting.board,
          kind: err.kind,
          reason: err.message,
        });
        return [];
      }
      const asked = new Set(request.questions.map((q) => q.fieldId));
      return reply.answers.filter((a) => asked.has(a.fieldId));
    },
  };
}

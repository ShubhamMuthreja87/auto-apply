/**
 * The inputs of the two real AI recordings in `apps/api/fixtures/ai/` (ticket
 * 09): one Posting evaluation and one free-text answer, both over a recorded
 * Greenhouse posting and form. `record-ai.ts` builds its two requests from
 * these, and the replay tests build theirs from the same functions, so a
 * recording and its test can never drift apart. Test and tool support only;
 * not part of the server build.
 */
import type { FitCriterion, Posting, User } from "@auto-apply/shared";
import { readBoardFixture } from "../discovery/fixtures.js";
import { languageGateQuestions } from "../evaluation/language-gate.js";
import { aiCriteria, buildRubric } from "../evaluation/rubric.js";
import { candidateFacts } from "../forms/candidate-facts.js";
import { greenhouseForms } from "../forms/greenhouse-forms.js";
import { resolveFields } from "../forms/resolve.js";
import type { FreeTextRequest } from "../pipeline/ports.js";
import { SEED_USER } from "../seed-user.js";

/** Anthropic's "Engineering Manager, Business Technology", recorded in the board fixture. */
export const RECORDED_JOB = { board: "anthropic", jobId: "5418402008" } as const;

export const RECORDED_USER: User = { uid: "demo-user", ...SEED_USER };

export async function recordedPosting(): Promise<Posting> {
  const postings = await readBoardFixture(
    { ats: "greenhouse", board: RECORDED_JOB.board },
    "fixture",
  );
  const posting = postings.find((p) => p.jobId === RECORDED_JOB.jobId);
  if (!posting) throw new Error(`No recorded posting ${RECORDED_JOB.board}/${RECORDED_JOB.jobId}`);
  return posting;
}

/** What the pipeline asks the evaluator: the rubric's AI-side criteria and the language gate's questions. */
export function recordedEvaluationCriteria(user: User = RECORDED_USER): FitCriterion[] {
  return [...aiCriteria(buildRubric(user.preferences)), ...languageGateQuestions(user.preferences)];
}

/**
 * The free-text request `fillForm` would make for the recorded form: the
 * required fields that resolve to the AI, with the redacted candidate facts
 * and EM framing (a manager title).
 */
export async function recordedFreeTextRequest(
  user: User = RECORDED_USER,
): Promise<FreeTextRequest> {
  const posting = await recordedPosting();
  const forms = greenhouseForms({ fetch, timeoutMs: 1_000, mode: "fixtures" });
  const schema = await forms.fetchSchema(RECORDED_JOB);
  const toDraft = resolveFields(schema.fields, user).filter(
    (r) => r.source === "ai" && r.field.required,
  );
  if (toDraft.length === 0) throw new Error("The recorded form has no required free-text field");
  return {
    posting,
    framing: "EM",
    facts: candidateFacts(user),
    questions: toDraft.map((r) => ({
      fieldId: r.field.id,
      label: r.field.label,
      description: r.field.description,
    })),
  };
}

/**
 * Every string that identifies, contacts or locates the user (D23). A
 * recorded request must contain none of them.
 */
export function personalStrings(user: User = RECORDED_USER): string[] {
  const { profile, settings } = user;
  return [
    profile.fullName,
    profile.firstName,
    profile.lastName,
    profile.email,
    profile.phone,
    profile.location,
    profile.location.split(",")[0]?.trim(),
    settings.location.current,
    settings.location.postalAddress,
    profile.links.linkedin,
    profile.links.github,
    profile.links.website,
  ].filter((s): s is string => typeof s === "string" && s.trim().length > 1);
}

/** The personal strings found in `text`, case-insensitively; `[]` when it is clean. */
export function personalStringsIn(text: string, user: User = RECORDED_USER): string[] {
  const lower = text.toLowerCase();
  return personalStrings(user).filter((s) => lower.includes(s.toLowerCase()));
}

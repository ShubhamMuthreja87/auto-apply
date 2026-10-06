/**
 * Fills an APPLY NOW Posting's application form (D5, D9–D12): read and merge
 * the Greenhouse form, resolve every field to one source, have the AI draft
 * the required free text, and report the required fields still unanswered —
 * the `needs_you` list (D11). Nothing is sent anywhere; the resolutions are
 * what the simulated submit (ticket 11) builds its payload from.
 *
 * The AI is asked only when it can make a difference: never with no AI
 * configured (free text then falls to the user), never when another required
 * field already holds the job for the user, and only for required free text.
 * Its answers count only when they cite candidate facts it was given (D12).
 */
import type { MissingField, Posting, User } from "@auto-apply/shared";
import { logger } from "../logger.js";
import type { FormSchema, FreeTextAnswerer, GreenhouseForms } from "../pipeline/ports.js";
import { candidateFacts } from "./candidate-facts.js";
import { missingRequired, resolveFields, type FieldResolution } from "./resolve.js";

export interface FormFill {
  formUrl: string;
  /** Where the form came from: live, or its recording (D3). */
  source: FormSchema["source"];
  resolutions: FieldResolution[];
  /** Required fields without an answer; empty when the form is complete. */
  missing: MissingField[];
}

export interface FormFillDeps {
  forms: GreenhouseForms;
  /** `null` when no AI is configured: free text is then the user's (D24). */
  answerer: FreeTextAnswerer | null;
}

const NO_AI = "Free text; no AI is configured, so only you can answer (D24)";
const NOT_DRAFTED = "Free text; not drafted, since this job already needs you for other fields";
const UNGROUNDED = "Free text the AI could not ground in your profile or settings (D12)";
const OPTIONAL_BLANK = "Optional free text; left blank";

export async function fillForm(
  deps: FormFillDeps,
  posting: Posting,
  user: User,
  framing: "EM" | "Staff",
): Promise<FormFill> {
  const schema = await deps.forms.fetchSchema({ board: posting.board, jobId: posting.jobId });
  let resolutions = resolveFields(schema.fields, user);

  const toDraft = resolutions.filter((r) => r.source === "ai" && r.field.required);
  const heldAnyway = missingRequired(resolutions.filter((r) => r.source !== "ai")).length > 0;
  const drafted = new Map<string, string>();
  let unansweredWhy = UNGROUNDED;

  if (toDraft.length > 0 && !deps.answerer) {
    unansweredWhy = NO_AI;
  } else if (toDraft.length > 0 && heldAnyway) {
    unansweredWhy = NOT_DRAFTED;
  } else if (toDraft.length > 0 && deps.answerer) {
    const facts = candidateFacts(user);
    const factIds = new Set(facts.map((f) => f.id));
    const asked = new Set(toDraft.map((r) => r.field.id));
    const answers = await deps.answerer.answer({
      posting,
      framing,
      facts,
      questions: toDraft.map((r) => ({
        fieldId: r.field.id,
        label: r.field.label,
        description: r.field.description,
      })),
    });
    for (const a of answers) {
      const grounded = a.basedOn.length > 0 && a.basedOn.every((id) => factIds.has(id));
      if (asked.has(a.fieldId) && a.answer.trim() && grounded) {
        drafted.set(a.fieldId, a.answer.trim());
      }
    }
    logger.info("form_free_text_drafted", {
      jobId: posting.jobId,
      board: posting.board,
      asked: asked.size,
      grounded: drafted.size,
    });
  }

  resolutions = resolutions.map((r): FieldResolution => {
    if (r.source !== "ai") return r;
    if (!r.field.required) return { ...r, why: OPTIONAL_BLANK };
    const answer = drafted.get(r.field.id);
    if (answer !== undefined) return { ...r, value: answer };
    // Not drafted is still the AI's to draft later; anything else falls to the user.
    return {
      field: r.field,
      source: unansweredWhy === NOT_DRAFTED ? "ai" : "user",
      why: unansweredWhy,
    };
  });

  return {
    formUrl: schema.formUrl,
    source: schema.source,
    resolutions,
    missing: missingRequired(resolutions),
  };
}

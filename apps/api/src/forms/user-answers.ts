/**
 * The user's own answers to a `held: needs_you` job's missing fields (Answer &
 * submit), checked against each field's type and options and turned into
 * answers with source `user`. This is the user answering — legal, consent and
 * demographic questions included, which D10 allows; the resolver still never
 * auto-answers them.
 *
 * Pure. Invalid answers are reported by field id only, never by value: the
 * values can be personal (PII).
 */
import type { MissingField, SubmittedAnswer, UserAnswerValue } from "@auto-apply/shared";
import type { FormOption } from "../pipeline/ports.js";

/** A yes/no field with no options of its own takes Greenhouse's usual 1 / 0. */
const YES_NO: FormOption[] = [
  { label: "Yes", value: 1 },
  { label: "No", value: 0 },
];

export type UserAnswersCheck =
  | { ok: true; answers: SubmittedAnswer[] }
  /** The ids of the fields left unanswered or answered with something they cannot take. */
  | { ok: false; invalid: string[] };

/** The choices a field offers; a yes/no field without any gets Yes / No. */
export function choicesOf(field: Pick<MissingField, "type" | "options">): FormOption[] {
  if (field.options.length > 0) return field.options;
  return field.type === "boolean" ? YES_NO : [];
}

function isWebUrl(text: string): boolean {
  try {
    const { protocol } = new URL(text);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

/** The answer as stored, or `null` when the field cannot take it. */
function valueFor(
  field: MissingField,
  given: UserAnswerValue | undefined,
): SubmittedAnswer["value"] | null {
  if (given === undefined) return null;
  switch (field.type) {
    case "text":
    case "textarea": {
      const text = typeof given === "string" ? given.trim() : "";
      return text === "" ? null : text;
    }
    case "file": {
      const url = typeof given === "string" ? given.trim() : "";
      return isWebUrl(url) ? url : null;
    }
    case "select":
    case "boolean":
    case "multiselect": {
      const wanted = (Array.isArray(given) ? given : [given]).map(String);
      if (wanted.length === 0 || (field.type !== "multiselect" && wanted.length > 1)) return null;
      const choices = choicesOf(field);
      const chosen = choices.filter((option) => wanted.includes(String(option.value)));
      // Every value must name one of the field's options.
      return chosen.length === new Set(wanted).size ? chosen : null;
    }
  }
}

/**
 * Checks the user's answers against every missing field (all required, D11)
 * and returns them as `user` answers in the fields' order. Answers to fields
 * that are not missing are ignored, so the draft's answers stay as resolved.
 */
export function checkUserAnswers(
  missing: readonly MissingField[],
  given: Readonly<Record<string, UserAnswerValue>>,
): UserAnswersCheck {
  const answers: SubmittedAnswer[] = [];
  const invalid: string[] = [];
  for (const field of missing) {
    const value = valueFor(field, Object.hasOwn(given, field.id) ? given[field.id] : undefined);
    if (value === null) {
      invalid.push(field.id);
    } else {
      answers.push({ id: field.id, label: field.label, type: field.type, source: "user", value });
    }
  }
  return invalid.length > 0 ? { ok: false, invalid } : { ok: true, answers };
}

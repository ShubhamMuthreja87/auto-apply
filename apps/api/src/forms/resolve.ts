/**
 * Field resolution (D9, D10): every field of a merged application form gets
 * exactly one source, checked in this order:
 *
 *   1. **user-only** — the API's compliance/demographic groups, and any
 *      question that is a legal agreement, an employer AI-policy
 *      acknowledgement, consent, demographic or compensation. Never
 *      auto-answered, whatever the settings say (D10).
 *   2. **profile / settings** — standard fields matched by id or label and
 *      filled here, in code, from the user document. Name and contact
 *      details are only ever filled here, never by the model (D23). A
 *      matched field the user document does not answer is user-only.
 *   3. **ai** — remaining free text (`text`, `textarea`), drafted later from
 *      the candidate's facts. A personal detail with no rule (a legal name,
 *      how to pronounce a name) is user-only instead, so it never reaches
 *      the model.
 *   4. **user-only** — everything left: selects, files and facts only the
 *      user knows ("Have you interviewed here before?").
 *
 * Pure: the resolutions feed both the payload builder and the needs_you list.
 */
import type { MissingField, User } from "@auto-apply/shared";
import type { FormField, FormOption } from "../pipeline/ports.js";

export type FieldSource = "profile" | "settings" | "ai" | "user";

/** Text for text-like fields and files (a URL); the chosen options for selects. */
export type FieldValue = string | FormOption[];

export interface FieldResolution {
  field: FormField;
  source: FieldSource;
  /** Absent when nobody has answered yet: a user-only field, or AI free text not yet drafted. */
  value?: FieldValue;
  /** Why this source and value, in words the needs_you list can show. */
  why: string;
}

/* ---------------------------- 1. never automatic --------------------------- */

const NEVER_AUTO: { why: string; pattern: RegExp }[] = [
  {
    why: "Employer AI-policy acknowledgement; never auto-answered (D10)",
    pattern: /\bai[- ](usage |use )?policy\b|\buse of ai\b/i,
  },
  {
    why: "Legal agreement; never auto-answered (D10)",
    pattern: /arbitrat|\bagreement\b|terms (and|&) conditions|\bcertify\b|\battest|\bsignature\b/i,
  },
  {
    why: "Consent or acknowledgement; never auto-answered (D10)",
    pattern:
      /\bconsent|privacy (policy|notice)|acknowledg|\bopt[- ]?in\b|whatsapp|\bsms\b|text messages/i,
  },
  {
    why: "Demographic question; never auto-answered (D10)",
    pattern:
      /\bgender\b|\brace\b|ethnicit|\bveteran|disabilit|sexual orientation|transgender|hispanic|latin[oa]\b/i,
  },
  {
    why: "Compensation; always yours to answer",
    pattern: /salary|compensation|\bpay\b|\bctc\b|remuneration/i,
  },
];

function neverAutomatic(field: FormField): string | null {
  if (field.group === "compliance" || field.group === "demographic") {
    return "Compliance or demographic question; never auto-answered (D10)";
  }
  return NEVER_AUTO.find((rule) => rule.pattern.test(field.label))?.why ?? null;
}

/* --------------------------- 2. profile / settings ------------------------- */

function isTextLike(field: FormField): boolean {
  return field.type === "text" || field.type === "textarea";
}

/** A text answer for a text field, or the select option that says the same. */
function asAnswer(field: FormField, text: string | null | undefined): FieldValue | null {
  if (!text) return null;
  if (isTextLike(field)) return text;
  if (field.type === "select" || field.type === "multiselect") {
    const wanted = text.trim().toLowerCase();
    const option = field.options?.find((o) => o.label.trim().toLowerCase() === wanted);
    return option ? [option] : null;
  }
  return null;
}

/** The first option whose label matches, for a select field. */
function pick(field: FormField, matches: (label: string) => boolean): FieldValue | null {
  if (field.type !== "select" && field.type !== "multiselect") return null;
  const option = field.options?.find((o) => matches(o.label));
  return option ? [option] : null;
}

function pickYesNo(field: FormField, answer: boolean | null): FieldValue | null {
  if (answer === null) return null;
  return pick(field, (label) => (answer ? /^\s*yes\b/i : /^\s*no\b/i).test(label));
}

function countryOf(place: string | null): string | null {
  return place?.split(",").at(-1)?.trim() || null;
}

interface Rule {
  source: "profile" | "settings";
  /** What in the user document answers it, for the `why`. */
  what: string;
  applies(field: FormField, label: string): boolean;
  value(user: User, field: FormField): FieldValue | null;
}

const byId =
  (...ids: string[]) =>
  (field: FormField) =>
    ids.includes(field.id);
const byLabel = (pattern: RegExp) => (_field: FormField, label: string) => pattern.test(label);

const RULES: Rule[] = [
  {
    source: "profile",
    what: "first name",
    applies: byId("first_name", "preferred_name"),
    value: (u, f) => asAnswer(f, u.profile.firstName),
  },
  {
    source: "profile",
    what: "last name",
    applies: byId("last_name"),
    value: (u, f) => asAnswer(f, u.profile.lastName),
  },
  {
    source: "profile",
    what: "email",
    applies: byId("email"),
    value: (u, f) => asAnswer(f, u.profile.email),
  },
  {
    source: "profile",
    what: "phone",
    applies: byId("phone"),
    value: (u, f) => asAnswer(f, u.profile.phone),
  },
  {
    source: "settings",
    what: "documents.resumeUrl",
    applies: byId("resume"),
    value: (u) => u.settings.documents.resumeUrl,
  },
  {
    source: "settings",
    what: "documents.coverLetter",
    applies: byId("cover_letter"),
    value: (u) => u.settings.documents.coverLetter,
  },
  {
    source: "settings",
    what: "location.current",
    applies: (f) => f.group === "location" && f.id === "location",
    value: (u, f) => asAnswer(f, u.settings.location.current),
  },
  {
    source: "settings",
    what: "education.school",
    applies: byId("education.school"),
    value: (u, f) => asAnswer(f, u.settings.education.school),
  },
  {
    source: "settings",
    what: "education.highestDegree",
    applies: byId("education.degree"),
    value: (u, f) => asAnswer(f, u.settings.education.highestDegree),
  },
  {
    source: "settings",
    what: "a discipline (not stored)",
    applies: byId("education.discipline"),
    value: () => null,
  },
  {
    source: "profile",
    what: "links.linkedin",
    applies: byLabel(/linkedin/),
    value: (u, f) => asAnswer(f, u.profile.links.linkedin),
  },
  {
    source: "profile",
    what: "links.github",
    applies: byLabel(/github/),
    value: (u, f) => asAnswer(f, u.profile.links.github),
  },
  {
    source: "profile",
    what: "links.website",
    applies: byLabel(/\bwebsite\b|portfolio|\bblog\b/),
    value: (u, f) => asAnswer(f, u.profile.links.website),
  },
  {
    source: "settings",
    what: "other.howDidYouHear",
    applies: byLabel(/how did you hear/),
    value: (u, f) => asAnswer(f, u.settings.other.howDidYouHear),
  },
  {
    source: "settings",
    what: "other.pronouns",
    applies: byLabel(/\bpronouns?\b/),
    value: (u, f) => asAnswer(f, u.settings.other.pronouns),
  },
  {
    source: "settings",
    what: "location.requiresVisaSponsorship",
    applies: byLabel(/sponsor|\bvisa\b/),
    value: (u, f) => pickYesNo(f, u.settings.location.requiresVisaSponsorship),
  },
  {
    source: "settings",
    what: "location.willingToRelocate",
    applies: byLabel(/relocat/),
    value: (u, f) => {
      const willing = u.settings.location.willingToRelocate;
      if (willing === null) return null;
      return willing
        ? pick(
            f,
            (l) => (/^\s*yes\b/i.test(l) || /willing to relocate/i.test(l)) && !/\bnot\b/i.test(l),
          )
        : pick(f, (l) => /^\s*no\b/i.test(l) || /\bnot\b/i.test(l));
    },
  },
  {
    source: "settings",
    what: "location.workArrangement",
    applies: byLabel(/work remotely/),
    value: (u, f) => {
      const arrangement = u.settings.location.workArrangement?.toLowerCase() ?? null;
      if (arrangement === null) return null;
      return arrangement.includes("remote")
        ? pick(f, (l) => /remote/i.test(l) && !/office/i.test(l))
        : pick(f, (l) => /office/i.test(l));
    },
  },
  {
    source: "settings",
    what: "location.workAuthorizationCountries",
    applies: byLabel(/countr(y|ies)\b.*\b(anticipate|plan|intend|expect)\b.*\bwork/),
    value: (u, f) => {
      if (f.type !== "multiselect" && f.type !== "select") return null;
      const countries = new Set(
        u.settings.location.workAuthorizationCountries.map((c) => c.toLowerCase()),
      );
      const chosen = (f.options ?? []).filter((o) => countries.has(o.label.trim().toLowerCase()));
      return chosen.length > 0 ? (f.type === "select" ? chosen.slice(0, 1) : chosen) : null;
    },
  },
  {
    source: "settings",
    what: "location.current",
    applies: byLabel(/countr(y|ies)\b.*\b(reside|live)\b/),
    value: (u, f) => (isTextLike(f) ? null : asAnswer(f, countryOf(u.settings.location.current))),
  },
  {
    // Only where the countries in question are the ones we chose from the
    // user's work authorisation, or the label names one of them.
    source: "settings",
    what: "location.workAuthorizationCountries",
    applies: byLabel(/authori[sz]ed to work|eligible to work/),
    value: (u, f) => {
      const label = f.label.toLowerCase();
      const countries = u.settings.location.workAuthorizationCountries;
      const covered =
        countries.length > 0 &&
        (/you selected|previous response/.test(label) ||
          countries.some((c) => label.includes(c.toLowerCase())));
      return covered ? pickYesNo(f, true) : null;
    },
  },
  {
    source: "settings",
    what: "availability.earliestStartDate",
    applies: byLabel(/earliest.*\bstart|start date|when can you start|available to start/),
    value: (u, f) => (isTextLike(f) ? u.settings.availability.earliestStartDate : null),
  },
  {
    source: "settings",
    what: "availability.noticePeriodDays",
    applies: byLabel(/notice period/),
    value: (u, f) => {
      const days = u.settings.availability.noticePeriodDays;
      return isTextLike(f) && days !== null ? `${days} days` : null;
    },
  },
  {
    source: "profile",
    what: "experience (most recent employer)",
    applies: byLabel(/(current|previous|recent) (or previous )?employer/),
    value: (u, f) => asAnswer(f, u.profile.experience[0]?.company),
  },
  {
    source: "profile",
    what: "experience (most recent title)",
    applies: byLabel(/(current|previous|recent) (or previous )?(job )?title/),
    value: (u, f) => asAnswer(f, u.profile.experience[0]?.title),
  },
  {
    source: "settings",
    what: "experience.totalYears",
    applies: byLabel(/years of (professional |relevant |work )?experience/),
    value: (u, f) => {
      const years = u.settings.experience.totalYears;
      return isTextLike(f) && years !== null ? String(years) : null;
    },
  },
];

/* ------------------------------- 3 and 4 ---------------------------------- */

/** Personal details with no rule above: never sent to the model (D23). */
const PERSONAL = /\bname\b|e-?mail|phone|\baddress\b|pronounc|\bbirth/i;

function resolveOne(field: FormField, user: User): FieldResolution {
  const never = neverAutomatic(field);
  if (never) return { field, source: "user", why: never };

  const label = field.label.toLowerCase();
  const rule = RULES.find((r) => r.applies(field, label));
  if (rule) {
    const value = rule.value(user, field);
    if (value !== null && value !== "") {
      return { field, source: rule.source, value, why: `From your ${rule.source}: ${rule.what}` };
    }
    return {
      field,
      source: "user",
      why: `Not answered by your ${rule.source} (${rule.what})`,
    };
  }

  if (PERSONAL.test(`${field.label} ${field.description}`)) {
    return {
      field,
      source: "user",
      why: "Personal detail; only you can answer, never sent to the AI (D23)",
    };
  }
  if (isTextLike(field)) {
    return {
      field,
      source: "ai",
      why: "Free text; drafted by the AI from your profile and settings (D12)",
    };
  }
  return {
    field,
    source: "user",
    why: "Not covered by your profile or settings; only you can answer",
  };
}

/** Resolves every field to exactly one source, in form order. */
export function resolveFields(fields: readonly FormField[], user: User): FieldResolution[] {
  return fields.map((field) => resolveOne(field, user));
}

/** The required fields left without a value: what holds a job as `needs_you` (D11). */
export function missingRequired(resolutions: readonly FieldResolution[]): MissingField[] {
  return resolutions
    .filter((r) => r.field.required && (r.value === undefined || r.value.length === 0))
    .map((r) => ({
      id: r.field.id,
      label: r.field.label,
      why: r.why,
      type: r.field.type,
      options: r.field.options ?? [],
    }));
}

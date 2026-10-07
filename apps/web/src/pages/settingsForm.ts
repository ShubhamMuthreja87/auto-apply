/**
 * The editable Settings form (ticket 17) as plain data: every editable value of
 * the user document becomes a {@link Field} keyed by its path in the
 * `PUT /api/me` body, with the text an input shows and how to read it back.
 * Inputs hold raw text (a half-typed "a, b," list must survive a keystroke);
 * {@link readForm} turns the texts into a request and validates it with the
 * contract, so the page shows the same rules the API enforces, per field.
 */
import {
  SALARY_FLOOR_RULE_ID,
  updateMeRequestSchema,
  type PreferencesPreset,
  type UpdateMeRequest,
  type User,
} from "@auto-apply/shared";

export type InputKind =
  "text" | "multiline" | "list" | "number" | "date" | "yesNo" | "cap" | "preset";

/** The preferences presets as the Settings page names them. */
export const PRESET_LABELS: Record<PreferencesPreset, string> = {
  default: "My preferences (default)",
  demo: "Demo (broadened)",
};

export interface Field {
  /** The value's path in the request body, e.g. `preferences.fitCriteria.0.weight`. */
  key: string;
  label: string;
  input: InputKind;
  help?: string;
  /** The text the input starts with. */
  initial: string;
  /** Writes the parsed text into `draft`; returns an error message instead when it does not parse. */
  apply(draft: UpdateMeRequest, raw: string): string | null;
}

/** A rubric rule shown as a table row with its source quote (D6). */
export interface RuleRow {
  id: string;
  label: string;
  source: string;
  fields: Field[];
}

export interface SettingsForm {
  /** Which preferences a Run uses: the stored ones, or Demo (broadened). */
  preset: Field;
  profile: Field[];
  preferences: Field[];
  fitCriteria: RuleRow[];
  hardBlocks: RuleRow[];
  companyBlocks: RuleRow[];
  languageGate: RuleRow[];
  settings: Field[];
}

type Read<T> = { ok: true; value: T } | { ok: false; error: string };

interface Codec<T> {
  input: InputKind;
  help?: string;
  show(value: T): string;
  read(raw: string): Read<T>;
}

const ok = <T>(value: T): Read<T> => ({ ok: true, value });
const fail = (error: string): Read<never> => ({ ok: false, error });

const text: Codec<string> = { input: "text", show: (v) => v, read: (raw) => ok(raw.trim()) };
const requiredText: Codec<string> = {
  ...text,
  read: (raw) => (raw.trim() === "" ? fail("Required") : ok(raw.trim())),
};
const multiline: Codec<string> = { ...text, input: "multiline" };
const optText: Codec<string | null> = {
  input: "text",
  help: "Empty means you answer it on the form",
  show: (v) => v ?? "",
  read: (raw) => ok(raw.trim() === "" ? null : raw.trim()),
};
const date: Codec<string | null> = {
  ...optText,
  input: "date",
  read: (raw) =>
    raw === "" ? ok(null) : /^\d{4}-\d{2}-\d{2}$/.test(raw) ? ok(raw) : fail("Use YYYY-MM-DD"),
};
const list: Codec<string[]> = {
  input: "list",
  help: "Comma-separated",
  show: (v) => v.join(", "),
  read: (raw) =>
    ok(
      raw
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item !== ""),
    ),
};

function numberCodec(options: { integer: boolean; min?: number }): Codec<number | null> {
  return {
    input: "number",
    show: (v) => (v === null ? "" : String(v)),
    read: (raw) => {
      if (raw.trim() === "") return ok(null);
      const n = Number(raw);
      if (!Number.isFinite(n)) return fail("Enter a number");
      if (options.integer && !Number.isInteger(n)) return fail("Enter a whole number");
      if (options.min !== undefined && n < options.min) return fail(`At least ${options.min}`);
      return ok(n);
    },
  };
}
const optCount = numberCodec({ integer: true, min: 0 });
const optYears = numberCodec({ integer: false, min: 0 });
const optInt = numberCodec({ integer: true });
/** A required whole number: empty is an error, not `null`. */
function int(min?: number): Codec<number> {
  const inner = numberCodec(min === undefined ? { integer: true } : { integer: true, min });
  return {
    input: "number",
    show: (v) => String(v),
    read: (raw) => {
      const read = inner.read(raw);
      if (!read.ok) return read;
      return read.value === null ? fail("Required") : ok(read.value);
    },
  };
}
const yesNo: Codec<boolean | null> = {
  input: "yesNo",
  show: (v) => (v === null ? "" : v ? "yes" : "no"),
  read: (raw) => ok(raw === "" ? null : raw === "yes"),
};
const preset: Codec<PreferencesPreset> = {
  input: "preset",
  show: (v) => v,
  read: (raw) => (raw === "default" || raw === "demo" ? ok(raw) : fail("Choose a preset")),
};
const cap: Codec<"APPLY" | "STRETCH"> = {
  input: "cap",
  show: (v) => v,
  read: (raw) => (raw === "APPLY" || raw === "STRETCH" ? ok(raw) : fail("Choose a cap")),
};

/** Erases `T` so fields of every type sit in one list. */
function field<T>(
  key: string,
  label: string,
  codec: Codec<T>,
  current: UpdateMeRequest,
  get: (u: UpdateMeRequest) => T,
  set: (u: UpdateMeRequest, value: T) => void,
): Field {
  return {
    key,
    label,
    input: codec.input,
    ...(codec.help === undefined ? {} : { help: codec.help }),
    initial: codec.show(get(current)),
    apply: (draft, raw) => {
      const read = codec.read(raw);
      if (!read.ok) return read.error;
      set(draft, read.value);
      return null;
    },
  };
}

/** The editable part of a user: what `PUT /api/me` takes. */
export function editableOf(user: User): UpdateMeRequest {
  const { alwaysUserOnly: _notEditable, ...settings } = user.settings;
  return structuredClone({ profile: user.profile, preferences: user.preferences, settings });
}

export function buildForm(user: User): SettingsForm {
  const u = editableOf(user);
  const f = <T>(
    key: string,
    label: string,
    codec: Codec<T>,
    get: (u: UpdateMeRequest) => T,
    set: (u: UpdateMeRequest, value: T) => void,
  ) => field(key, label, codec, u, get, set);

  const profile: Field[] = [
    f(
      "profile.fullName",
      "Full name",
      requiredText,
      (x) => x.profile.fullName,
      (x, v) => (x.profile.fullName = v),
    ),
    f(
      "profile.firstName",
      "First name",
      requiredText,
      (x) => x.profile.firstName,
      (x, v) => (x.profile.firstName = v),
    ),
    f(
      "profile.lastName",
      "Last name",
      requiredText,
      (x) => x.profile.lastName,
      (x, v) => (x.profile.lastName = v),
    ),
    f(
      "profile.email",
      "Email",
      requiredText,
      (x) => x.profile.email,
      (x, v) => (x.profile.email = v),
    ),
    f(
      "profile.phone",
      "Phone",
      text,
      (x) => x.profile.phone,
      (x, v) => (x.profile.phone = v),
    ),
    f(
      "profile.location",
      "Location",
      text,
      (x) => x.profile.location,
      (x, v) => (x.profile.location = v),
    ),
    f(
      "profile.links.linkedin",
      "LinkedIn",
      optText,
      (x) => x.profile.links.linkedin,
      (x, v) => (x.profile.links.linkedin = v),
    ),
    f(
      "profile.links.github",
      "GitHub",
      optText,
      (x) => x.profile.links.github,
      (x, v) => (x.profile.links.github = v),
    ),
    f(
      "profile.links.website",
      "Website",
      optText,
      (x) => x.profile.links.website,
      (x, v) => (x.profile.links.website = v),
    ),
    f(
      "profile.headline",
      "Headline",
      text,
      (x) => x.profile.headline,
      (x, v) => (x.profile.headline = v),
    ),
    f(
      "profile.summary",
      "Summary",
      multiline,
      (x) => x.profile.summary,
      (x, v) => (x.profile.summary = v),
    ),
    ...u.profile.skills.map((skill, i) =>
      f(
        `profile.skills.${i}.items`,
        `Skills: ${skill.category}`,
        list,
        (x) => x.profile.skills[i]?.items ?? [],
        (x, v) => {
          const target = x.profile.skills[i];
          if (target) target.items = v;
        },
      ),
    ),
  ];

  const preferences: Field[] = [
    f(
      "preferences.region",
      "Region",
      text,
      (x) => x.preferences.region,
      (x, v) => (x.preferences.region = v),
    ),
    f(
      "preferences.goal.text",
      "Goal",
      multiline,
      (x) => x.preferences.goal.text,
      (x, v) => (x.preferences.goal.text = v),
    ),
    f(
      "preferences.location.accepted",
      "Accepted locations",
      list,
      (x) => x.preferences.location.accepted,
      (x, v) => (x.preferences.location.accepted = v),
    ),
    f(
      "preferences.location.remoteOpenTo",
      "Remote open to",
      list,
      (x) => x.preferences.location.remoteOpenTo,
      (x, v) => (x.preferences.location.remoteOpenTo = v),
    ),
    f(
      "preferences.stack.strong",
      "Strong stack",
      list,
      (x) => x.preferences.stack.strong,
      (x, v) => (x.preferences.stack.strong = v),
    ),
    f(
      "preferences.stack.workingKnowledge",
      "Working knowledge",
      list,
      (x) => x.preferences.stack.workingKnowledge,
      (x, v) => (x.preferences.stack.workingKnowledge = v),
    ),
    f(
      "preferences.stack.not",
      "Not in stack",
      list,
      (x) => x.preferences.stack.not,
      (x, v) => (x.preferences.stack.not = v),
    ),
    f(
      "preferences.excludedTitles.terms",
      "Excluded titles",
      list,
      (x) => x.preferences.excludedTitles.terms,
      (x, v) => (x.preferences.excludedTitles.terms = v),
    ),
    f(
      "preferences.companyBlocks.allowedExceptions.companies",
      "Large companies allowed",
      list,
      (x) => x.preferences.companyBlocks.allowedExceptions.companies,
      (x, v) => (x.preferences.companyBlocks.allowedExceptions.companies = v),
    ),
    f(
      "preferences.verdictBands.applyNowMinFit",
      "APPLY NOW from fit",
      int(),
      (x) => x.preferences.verdictBands.applyNowMinFit,
      (x, v) => (x.preferences.verdictBands.applyNowMinFit = v),
    ),
    f(
      "preferences.verdictBands.applyMinFit",
      "APPLY from fit",
      int(),
      (x) => x.preferences.verdictBands.applyMinFit,
      (x, v) => (x.preferences.verdictBands.applyMinFit = v),
    ),
    f(
      "preferences.fitCap",
      "Fit cap",
      int(1),
      (x) => x.preferences.fitCap,
      (x, v) => (x.preferences.fitCap = v),
    ),
  ];

  const fitCriteria: RuleRow[] = u.preferences.fitCriteria.map((c, i) => ({
    id: c.id,
    label: c.label,
    source: c.source,
    fields: [
      f(
        `preferences.fitCriteria.${i}.weight`,
        `${c.label}: weight`,
        int(),
        (x) => x.preferences.fitCriteria[i]?.weight ?? 0,
        (x, v) => {
          const target = x.preferences.fitCriteria[i];
          if (target) target.weight = v;
        },
      ),
      f(
        `preferences.fitCriteria.${i}.terms`,
        `${c.label}: keyword terms`,
        list,
        (x) => x.preferences.fitCriteria[i]?.terms ?? [],
        (x, v) => {
          const target = x.preferences.fitCriteria[i];
          if (target) target.terms = v;
        },
      ),
    ],
  }));

  const hardBlocks: RuleRow[] = u.preferences.hardBlocks.map((rule, i) => ({
    id: rule.id,
    label: rule.label,
    source: rule.source,
    fields: [
      f(
        `preferences.hardBlocks.${i}.terms`,
        `${rule.label}: terms`,
        list,
        (x) => x.preferences.hardBlocks[i]?.terms ?? [],
        (x, v) => {
          const target = x.preferences.hardBlocks[i];
          if (target) target.terms = v;
        },
      ),
      // Compensation is never stored (ticket 04): the salary floor is server config.
      ...(rule.id === SALARY_FLOOR_RULE_ID
        ? []
        : [
            f(
              `preferences.hardBlocks.${i}.threshold`,
              `${rule.label}: threshold`,
              optInt,
              (x) => x.preferences.hardBlocks[i]?.threshold ?? null,
              (x, v) => {
                const target = x.preferences.hardBlocks[i];
                if (target) target.threshold = v;
              },
            ),
          ]),
    ],
  }));

  const companyBlocks: RuleRow[] = u.preferences.companyBlocks.categories.map((category, i) => ({
    id: category.id,
    label: category.label,
    source: category.source,
    fields: [
      f(
        `preferences.companyBlocks.categories.${i}.companies`,
        `${category.label}: companies`,
        list,
        (x) => x.preferences.companyBlocks.categories[i]?.companies ?? [],
        (x, v) => {
          const target = x.preferences.companyBlocks.categories[i];
          if (target) target.companies = v;
        },
      ),
    ],
  }));

  const languageGate: RuleRow[] = u.preferences.languageGate.map((rule, i) => ({
    id: rule.id,
    label: rule.label,
    source: rule.source,
    fields: [
      f(
        `preferences.languageGate.${i}.terms`,
        `${rule.label}: terms`,
        list,
        (x) => x.preferences.languageGate[i]?.terms ?? [],
        (x, v) => {
          const target = x.preferences.languageGate[i];
          if (target) target.terms = v;
        },
      ),
      f(
        `preferences.languageGate.${i}.cap`,
        `${rule.label}: verdict cap`,
        cap,
        (x) => x.preferences.languageGate[i]?.cap ?? "STRETCH",
        (x, v) => {
          const target = x.preferences.languageGate[i];
          if (target) target.cap = v;
        },
      ),
    ],
  }));

  const s = (x: UpdateMeRequest) => x.settings;
  const settings: Field[] = [
    f(
      "settings.location.current",
      "Current location",
      optText,
      (x) => s(x).location.current,
      (x, v) => (s(x).location.current = v),
    ),
    f(
      "settings.location.postalAddress",
      "Postal address",
      optText,
      (x) => s(x).location.postalAddress,
      (x, v) => (s(x).location.postalAddress = v),
    ),
    f(
      "settings.location.willingToRelocate",
      "Willing to relocate",
      yesNo,
      (x) => s(x).location.willingToRelocate,
      (x, v) => (s(x).location.willingToRelocate = v),
    ),
    f(
      "settings.location.relocationScope",
      "Relocation scope",
      optText,
      (x) => s(x).location.relocationScope,
      (x, v) => (s(x).location.relocationScope = v),
    ),
    f(
      "settings.location.workArrangement",
      "Work arrangement",
      optText,
      (x) => s(x).location.workArrangement,
      (x, v) => (s(x).location.workArrangement = v),
    ),
    f(
      "settings.location.workAuthorizationCountries",
      "Work authorization",
      list,
      (x) => s(x).location.workAuthorizationCountries,
      (x, v) => (s(x).location.workAuthorizationCountries = v),
    ),
    f(
      "settings.location.requiresVisaSponsorship",
      "Requires visa sponsorship",
      yesNo,
      (x) => s(x).location.requiresVisaSponsorship,
      (x, v) => (s(x).location.requiresVisaSponsorship = v),
    ),
    f(
      "settings.location.citizenship",
      "Citizenship",
      optText,
      (x) => s(x).location.citizenship,
      (x, v) => (s(x).location.citizenship = v),
    ),
    f(
      "settings.availability.noticePeriodDays",
      "Notice period (days)",
      optCount,
      (x) => s(x).availability.noticePeriodDays,
      (x, v) => (s(x).availability.noticePeriodDays = v),
    ),
    f(
      "settings.availability.earliestStartDate",
      "Earliest start date",
      date,
      (x) => s(x).availability.earliestStartDate,
      (x, v) => (s(x).availability.earliestStartDate = v),
    ),
    f(
      "settings.education.highestDegree",
      "Highest degree",
      optText,
      (x) => s(x).education.highestDegree,
      (x, v) => (s(x).education.highestDegree = v),
    ),
    f(
      "settings.education.school",
      "School",
      optText,
      (x) => s(x).education.school,
      (x, v) => (s(x).education.school = v),
    ),
    f(
      "settings.education.graduationYear",
      "Graduation year",
      optInt,
      (x) => s(x).education.graduationYear,
      (x, v) => (s(x).education.graduationYear = v),
    ),
    f(
      "settings.experience.totalYears",
      "Total experience (years)",
      optYears,
      (x) => s(x).experience.totalYears,
      (x, v) => (s(x).experience.totalYears = v),
    ),
    f(
      "settings.experience.peopleManagementYears",
      "People management (years)",
      optYears,
      (x) => s(x).experience.peopleManagementYears,
      (x, v) => (s(x).experience.peopleManagementYears = v),
    ),
    f(
      "settings.experience.largestTeamManaged",
      "Largest team managed",
      optCount,
      (x) => s(x).experience.largestTeamManaged,
      (x, v) => (s(x).experience.largestTeamManaged = v),
    ),
    f(
      "settings.documents.resumeUrl",
      "Résumé URL",
      optText,
      (x) => s(x).documents.resumeUrl,
      (x, v) => (s(x).documents.resumeUrl = v),
    ),
    f(
      "settings.documents.coverLetter",
      "Cover letter",
      { ...optText, input: "multiline" },
      (x) => s(x).documents.coverLetter,
      (x, v) => (s(x).documents.coverLetter = v),
    ),
    f(
      "settings.other.howDidYouHear",
      "How did you hear about us",
      optText,
      (x) => s(x).other.howDidYouHear,
      (x, v) => (s(x).other.howDidYouHear = v),
    ),
    f(
      "settings.other.pronouns",
      "Pronouns",
      optText,
      (x) => s(x).other.pronouns,
      (x, v) => (s(x).other.pronouns = v),
    ),
  ];

  const presetField = f(
    "settings.preferencesPreset",
    "Preferences preset",
    preset,
    (x) => x.settings.preferencesPreset,
    (x, v) => (x.settings.preferencesPreset = v),
  );

  return {
    preset: presetField,
    profile,
    preferences,
    fitCriteria,
    hardBlocks,
    companyBlocks,
    languageGate,
    settings,
  };
}

export function allFields(form: SettingsForm): Field[] {
  const rows = [
    ...form.fitCriteria,
    ...form.hardBlocks,
    ...form.companyBlocks,
    ...form.languageGate,
  ];
  return [
    form.preset,
    ...form.profile,
    ...form.preferences,
    ...rows.flatMap((row) => row.fields),
    ...form.settings,
  ];
}

/** Each field's starting text, by key. */
export function initialValues(form: SettingsForm): Record<string, string> {
  return Object.fromEntries(allFields(form).map((f) => [f.key, f.initial]));
}

export type FormRead =
  | { ok: true; request: UpdateMeRequest }
  /** `fields` by key; `general` for rules no single input owns. */
  | { ok: false; fields: Record<string, string>; general: string[] };

/**
 * Reads the inputs into a `PUT /api/me` body and validates it with the
 * contract, mapping each problem back to the input it came from.
 */
export function readForm(user: User, form: SettingsForm, values: Record<string, string>): FormRead {
  const draft = editableOf(user);
  const fields: Record<string, string> = {};
  for (const f of allFields(form)) {
    const error = f.apply(draft, values[f.key] ?? f.initial);
    if (error !== null) fields[f.key] = error;
  }
  if (Object.keys(fields).length > 0) return { ok: false, fields, general: [] };

  const parsed = updateMeRequestSchema.safeParse(draft);
  if (parsed.success) return { ok: true, request: parsed.data };
  const keys = new Set(allFields(form).map((f) => f.key));
  const general: string[] = [];
  for (const issue of parsed.error.issues) {
    const key = issue.path.join(".");
    if (keys.has(key)) fields[key] = issue.message;
    else general.push(`${key}: ${issue.message}`);
  }
  return { ok: false, fields, general };
}

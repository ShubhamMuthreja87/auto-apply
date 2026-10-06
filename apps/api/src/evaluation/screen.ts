/**
 * Screening: the cheap, deterministic front of evaluation (D7). Pure code over
 * a Posting and the user's preferences, run before any AI call, so a Posting
 * that fails here spends no tokens.
 *
 * - **Hard blocks** (`preferences.hardBlocks`, in their listed order): the
 *   first rule that fails blocks the Posting with a reason. Code judges only
 *   what it can read reliably — the location text, the company name, the
 *   title, and plainly stated numbers in the description (years of
 *   experience, direct reports, an INR pay range). Rules that need facts the
 *   boards do not expose or judgement over prose (`company_size`,
 *   `staffing_blocked_client`, and any id without a predicate here) are left
 *   to the rubric.
 * - **Titles out of target** (`preferences.excludedTitles`): skipped, not
 *   blocked, as the author's prompt says. Terms marked "-only" need judgement
 *   and are left to the rubric too.
 */
import type { HardBlockRule, Posting, UserPreferences } from "@auto-apply/shared";

export type Screening =
  | { outcome: "pass" }
  | { outcome: "blocked"; ruleId: string; reason: string }
  | { outcome: "skipped"; reason: string };

export interface ScreeningOptions {
  /** The salary hard block's floor in lakhs per annum; the block is inactive without it. */
  salaryFloorLpa?: number;
}

export function screenPosting(
  posting: Posting,
  preferences: UserPreferences,
  options: ScreeningOptions = {},
): Screening {
  for (const rule of preferences.hardBlocks) {
    const predicate = hardBlockPredicates[rule.id];
    const evidence = predicate?.({ posting, preferences, rule, options });
    if (evidence)
      return { outcome: "blocked", ruleId: rule.id, reason: `${rule.label} (${evidence})` };
  }
  const excludedTerm = excludedTitleTerms(preferences).find((term) =>
    containsTerm(posting.title, term),
  );
  if (excludedTerm) return { outcome: "skipped", reason: `Title out of target: ${excludedTerm}` };
  return { outcome: "pass" };
}

interface RuleInput {
  posting: Posting;
  preferences: UserPreferences;
  rule: HardBlockRule;
  options: ScreeningOptions;
}

/** Returns the evidence that the rule fails (shown in the reason), or `null` when it holds. */
type HardBlockPredicate = (input: RuleInput) => string | null;

const hardBlockPredicates: Record<string, HardBlockPredicate> = {
  location: ({ posting, preferences }) => {
    if (locationAccepted(posting, preferences)) return null;
    if (offersRelocation(posting.descriptionText)) return null;
    return posting.remote
      ? `remote, not open to ${preferences.location.remoteOpenTo.join(" or ")}: ${posting.location}`
      : posting.location;
  },

  company_category: ({ posting, preferences }) => {
    for (const category of preferences.companyBlocks.categories) {
      const company = category.companies.find((name) => containsTerm(posting.company, name));
      if (company) return `${posting.company}: ${category.label}`;
    }
    return null;
  },

  employment_type: ({ posting, rule }) => firstTermIn(posting.title, rule.terms),

  role_family: ({ posting, rule }) => firstTermIn(posting.title, rule.terms),

  ai_strategy_consulting: ({ posting, rule }) =>
    firstTermIn(`${posting.title}\n${posting.descriptionText}`, rule.terms),

  team_size: ({ posting, rule }) => {
    const term = firstTermIn(posting.descriptionText, rule.terms);
    if (term) return term;
    if (rule.threshold === null) return null;
    for (const match of posting.descriptionText.matchAll(/(\d{1,3})\s*\+?\s*direct reports/gi)) {
      if (Number(match[1]) >= rule.threshold) return match[0];
    }
    return null;
  },

  experience_minimum: ({ posting, rule }) => {
    if (rule.threshold === null) return null;
    const minimum = statedExperienceMinimum(posting.descriptionText);
    return minimum !== null && minimum >= rule.threshold
      ? `asks for at least ${minimum} years`
      : null;
  },

  salary_below_floor: ({ posting, options }) => {
    if (options.salaryFloorLpa === undefined) return null;
    const max = statedMaxPayLpa(posting.descriptionText);
    return max !== null && max < options.salaryFloorLpa
      ? `pay up to ${max} LPA, floor ${options.salaryFloorLpa} LPA`
      : null;
  },
};

/* ------------------------------- matching ------------------------------- */

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Whether `text` mentions `term` as a whole word or phrase, case-insensitively
 * ("intern" does not match "Internal"); spaces and hyphens in the term match
 * either ("part-time" matches "Part time").
 */
export function containsTerm(text: string, term: string): boolean {
  return findTerm(text, term) !== null;
}

/** Where `text` first mentions `term`, matched as {@link containsTerm} does. */
export function findTerm(text: string, term: string): { index: number; length: number } | null {
  const words = term
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean)
    .map(escapeRegExp);
  if (words.length === 0) return null;
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${words.join("[\\s-]+")}(?![\\p{L}\\p{N}])`, "iu");
  const match = pattern.exec(text);
  return match ? { index: match.index, length: match[0].length } : null;
}

function firstTermIn(text: string, terms: readonly string[]): string | null {
  return terms.find((term) => containsTerm(text, term)) ?? null;
}

/* ------------------------------- location ------------------------------- */

/** Other names the boards use for the accepted locations. */
const placeAliases: Record<string, readonly string[]> = {
  "Delhi NCR": [
    "Delhi",
    "New Delhi",
    "NCR",
    "Gurugram",
    "Gurgaon",
    "Noida",
    "Faridabad",
    "Ghaziabad",
  ],
  Bengaluru: ["Bangalore"],
  Mumbai: ["Bombay", "Navi Mumbai"],
  Chennai: ["Madras"],
};

/** Location words that name no place: "Remote", "Hybrid", "In-Office", "N/A". */
const placelessWords =
  /\b(remote|hybrid|in[\s-]?office|office|on[\s-]?site|onsite|flexible|friendly|travel|required|or|and|n\/a|na|tbd)\b/gi;

/** Remote with no country restriction. */
const openEverywhere = /\b(worldwide|anywhere|global(ly)?)\b/i;

function locationAccepted(posting: Posting, preferences: UserPreferences): boolean {
  const text = `${posting.location}\n${posting.title}`;
  const places = preferences.location.accepted.flatMap((place) => [
    place,
    ...(placeAliases[place] ?? []),
  ]);
  if (places.some((place) => containsTerm(text, place))) return true;
  // A place in a country the user is open to (e.g. "India") is not clearly
  // outside the accepted locations; the rubric weighs it.
  if (preferences.location.remoteOpenTo.some((country) => containsTerm(text, country))) return true;
  if (posting.remote && openEverywhere.test(posting.location)) return true;
  // Nothing parseable ("Remote", "Hybrid", "N/A"): not a hard block.
  return posting.location.replace(placelessWords, "").replace(/[^\p{L}]/gu, "") === "";
}

const relocationOffer: readonly RegExp[] = [
  /\breloca(?:tion|te)\b[^.\n]{0,40}\b(?:support|assistance|package|stipend|benefits?|help|provided|available)\b/i,
  /\b(?:support|assist|help)\w*\b[^.\n]{0,30}\breloca(?:tion|te)\b/i,
];
const negation = /\b(?:not|no|without|isn't|cannot|unable|ineligible)\b/i;

/**
 * Whether the description offers relocation support, sentence by sentence; a
 * negated mention ("not eligible for relocation assistance") is no offer.
 */
function offersRelocation(description: string): boolean {
  return description
    .split(/[.\n]/)
    .some(
      (sentence) =>
        relocationOffer.some((pattern) => pattern.test(sentence)) && !negation.test(sentence),
    );
}

/* ------------------------------ description ----------------------------- */

const years = String.raw`(?:years?|yrs?)`;
const experiencePatterns: readonly RegExp[] = [
  new RegExp(String.raw`(\d{1,2})\s*(?:\+|plus|or more)\s*${years}`, "gi"),
  new RegExp(String.raw`(?:at least|minimum(?: of)?)\s*(\d{1,2})\s*${years}`, "gi"),
  new RegExp(String.raw`(\d{1,2})\s*(?:-|–|—|to)\s*\d{1,2}\s*${years}`, "gi"),
];

/**
 * The lowest minimum years of experience stated in the description, from
 * lines that mention experience ("8+ years of experience", "at least 10
 * years", "7-10 years" → 7). The lowest one decides, so a "preferred" or
 * secondary figure never blocks on its own. `null` when none is stated.
 */
function statedExperienceMinimum(description: string): number | null {
  const minima: number[] = [];
  for (const line of description.split("\n")) {
    if (!/experience/i.test(line)) continue;
    for (const pattern of experiencePatterns) {
      for (const match of line.matchAll(pattern)) minima.push(Number(match[1]));
    }
  }
  return minima.length > 0 ? Math.min(...minima) : null;
}

const currency = String.raw`(?:₹|inr|rs\.?)`;
const amount = String.raw`(\d[\d,]*(?:\.\d+)?)`;
const lakhUnit = String.raw`(lpa|lakhs?|lacs?|l)(?![a-z])`;
const payRange = new RegExp(
  String.raw`(${currency})?\s*${amount}\s*(?:${lakhUnit})?\s*(?:-|–|—|to)\s*(?:${currency})?\s*${amount}\s*(?:${lakhUnit})?`,
  "gi",
);
const payAmount = new RegExp(
  String.raw`(${currency})\s*${amount}\s*(?:${lakhUnit})?|${amount}\s*${lakhUnit}`,
  "gi",
);

/** An amount in lakhs: as written when a lakh unit is stated, else rupees ÷ 1,00,000. */
function toLakhs(raw: string, inLakhs: boolean): number | null {
  const value = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(value)) return null;
  if (inLakhs) return value;
  // An unlabelled small figure ("₹30") is ambiguous; never block on it.
  return value >= 100_000 ? Math.round((value / 100_000) * 10) / 10 : null;
}

/**
 * The highest INR pay figure stated in the description, in lakhs per annum.
 * Only rupee amounts are compared; other currencies would need an exchange
 * rate, so they never block. `null` when no INR pay is stated.
 */
function statedMaxPayLpa(description: string): number | null {
  const maxima: number[] = [];
  for (const m of description.matchAll(payRange)) {
    const [, cur, low, lowUnit, high, highUnit] = m;
    const unit = highUnit ?? lowUnit;
    if (!cur && !unit) continue;
    const values = [low, high].map((v) =>
      v === undefined ? null : toLakhs(v, unit !== undefined),
    );
    if (values.every((v): v is number => v !== null)) maxima.push(Math.max(...values));
  }
  if (maxima.length === 0) {
    for (const m of description.matchAll(payAmount)) {
      const [, , withCurrency, unitWithCurrency, bare, bareUnit] = m;
      const raw = withCurrency ?? bare;
      const value =
        raw === undefined ? null : toLakhs(raw, (unitWithCurrency ?? bareUnit) !== undefined);
      if (value !== null) maxima.push(value);
    }
  }
  return maxima.length > 0 ? Math.max(...maxima) : null;
}

/* -------------------------------- titles -------------------------------- */

/**
 * The excluded-title terms as plain phrases: "SAP/Salesforce" → "SAP",
 * "Salesforce"; "Java/.NET/PHP developer" → "Java developer", ".NET
 * developer", "PHP developer". Terms marked "-only" are dropped: whether a
 * role is "DevOps/SRE-only" is a judgement, not a keyword.
 */
function excludedTitleTerms(preferences: UserPreferences): string[] {
  return preferences.excludedTitles.terms.flatMap((term) => {
    if (/-only\b/i.test(term)) return [];
    const parts = term.split("/").map((part) => part.trim());
    const last = parts.at(-1) ?? "";
    const space = last.indexOf(" ");
    if (parts.length === 1 || space === -1) return parts;
    const suffix = last.slice(space);
    return [...parts.slice(0, -1).map((part) => `${part}${suffix}`), last];
  });
}

/**
 * The candidate facts an AI free-text answer may draw on (D12, D23): the
 * professional parts of the profile and the settings that answer common
 * questions, each with an id the answer must cite. Never the name, contact
 * details, links, current location or address — and as a second line of
 * defence, any of those strings that appears inside a fact is redacted.
 */
import type { User } from "@auto-apply/shared";
import type { CandidateFact } from "../pipeline/ports.js";

function yesNo(value: boolean | null, yes: string, no: string): string | null {
  return value === null ? null : value ? yes : no;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Every string that identifies or locates the user (D23). */
function personalStrings(user: User): string[] {
  const { profile, settings } = user;
  const city = profile.location.split(",")[0]?.trim();
  return [
    profile.fullName,
    profile.firstName,
    profile.lastName,
    profile.email,
    profile.phone,
    profile.location,
    city,
    settings.location.current,
    settings.location.postalAddress,
    profile.links.linkedin,
    profile.links.github,
    profile.links.website,
  ].filter((s): s is string => typeof s === "string" && s.trim().length > 1);
}

export function candidateFacts(user: User): CandidateFact[] {
  const { profile, settings } = user;
  const facts: { id: string; text: string | null }[] = [
    { id: "profile.headline", text: profile.headline },
    { id: "profile.summary", text: profile.summary },
    ...profile.experience.map((job, i) => ({
      id: `experience.${i}`,
      text: `${job.title} at ${job.company} (${job.start} – ${job.end ?? "present"}): ${job.highlights.join(" ")}`,
    })),
    ...profile.skills.map((group, i) => ({
      id: `skills.${i}`,
      text: `${group.category}: ${group.items.join(", ")}`,
    })),
    { id: "profile.leadership", text: profile.leadership.join(" ") || null },
    ...profile.education.map((ed, i) => ({
      id: `education.${i}`,
      text: `${ed.degree}, ${ed.school}${ed.endYear ? ` (${ed.endYear})` : ""}`,
    })),
    {
      id: "settings.availability",
      text:
        [
          settings.availability.noticePeriodDays !== null
            ? `Notice period: ${settings.availability.noticePeriodDays} days.`
            : null,
          settings.availability.earliestStartDate
            ? `Earliest start date: ${settings.availability.earliestStartDate}.`
            : null,
        ]
          .filter(Boolean)
          .join(" ") || null,
    },
    {
      id: "settings.workPreferences",
      text:
        [
          settings.location.workArrangement
            ? `Preferred work arrangement: ${settings.location.workArrangement}.`
            : null,
          yesNo(
            settings.location.willingToRelocate,
            `Willing to relocate${settings.location.relocationScope ? ` (${settings.location.relocationScope})` : ""}.`,
            "Not willing to relocate.",
          ),
          settings.location.workAuthorizationCountries.length > 0
            ? `Authorised to work in: ${settings.location.workAuthorizationCountries.join(", ")}.`
            : null,
          yesNo(
            settings.location.requiresVisaSponsorship,
            "Requires visa sponsorship.",
            "Does not require visa sponsorship.",
          ),
        ]
          .filter(Boolean)
          .join(" ") || null,
    },
    {
      id: "settings.experience",
      text:
        [
          settings.experience.totalYears !== null
            ? `${settings.experience.totalYears} years of experience.`
            : null,
          settings.experience.peopleManagementYears !== null
            ? `${settings.experience.peopleManagementYears} years managing people.`
            : null,
          settings.experience.largestTeamManaged !== null
            ? `Largest team managed: ${settings.experience.largestTeamManaged}.`
            : null,
        ]
          .filter(Boolean)
          .join(" ") || null,
    },
  ];

  const personal = personalStrings(user);
  const redact = (text: string) =>
    personal.reduce(
      (out, secret) => out.replace(new RegExp(escapeRegExp(secret), "gi"), "[redacted]"),
      text,
    );
  return facts
    .filter((f): f is CandidateFact => typeof f.text === "string" && f.text.trim().length > 0)
    .map((f) => ({ id: f.id, text: redact(f.text) }));
}

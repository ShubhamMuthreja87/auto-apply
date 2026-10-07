import { describe, expect, it } from "vitest";
import type { User } from "@auto-apply/shared";
import { parseGreenhouseForm } from "./greenhouse-forms.js";
import { readFormRecording } from "../discovery/fixtures.js";
import type { FormField, FormOption } from "../pipeline/ports.js";
import { SEED_USER } from "../seed-user.js";
import { missingRequired, resolveFields, type FieldResolution } from "./resolve.js";

const user: User = { uid: "u", ...SEED_USER };

const yesNo: FormOption[] = [
  { label: "Yes", value: 1 },
  { label: "No", value: 0 },
];

function field(overrides: Partial<FormField> & Pick<FormField, "label">): FormField {
  return {
    id: "question_1",
    description: "",
    type: "text",
    required: true,
    group: "questions",
    ...overrides,
  };
}

function resolveOne(f: FormField, who: User = user): FieldResolution {
  const [resolution] = resolveFields([f], who);
  if (!resolution) throw new Error("no resolution");
  return resolution;
}

describe("field resolution (D9, D10)", () => {
  // [case, field, expected source, expected value (undefined = none)]
  const cases: [string, FormField, FieldResolution["source"], unknown][] = [
    // (1) Never auto-answered, whatever the settings say (D10).
    [
      "EEOC compliance group",
      field({
        id: "gender",
        label: "Gender",
        group: "compliance",
        type: "select",
        options: yesNo,
        required: false,
      }),
      "user",
      undefined,
    ],
    [
      "demographic group",
      field({
        id: "demographic.1",
        label: "How do you identify?",
        group: "demographic",
        type: "select",
        options: yesNo,
      }),
      "user",
      undefined,
    ],
    [
      "AI-policy acknowledgement",
      field({ label: "AI Policy for Application", type: "select", options: yesNo }),
      "user",
      undefined,
    ],
    [
      "arbitration agreement",
      field({
        label: "Agreement to Arbitrate",
        type: "select",
        options: [{ label: "I understand and agree", value: 9 }],
      }),
      "user",
      undefined,
    ],
    [
      "privacy acknowledgement",
      field({
        label: "Please review and acknowledge Cloudflare's Candidate Privacy Policy",
        type: "multiselect",
        options: [{ label: "Acknowledge/Confirm", value: 1 }],
      }),
      "user",
      undefined,
    ],
    [
      "marketing opt-in",
      field({
        label: "Do you opt-in to receive WhatsApp messages from Stripe Recruiting?",
        type: "select",
        options: yesNo,
      }),
      "user",
      undefined,
    ],
    [
      "compensation",
      field({ label: "What are your salary expectations?", type: "textarea" }),
      "user",
      undefined,
    ],
    // (2) Profile and settings, filled in code.
    ["first name", field({ id: "first_name", label: "First Name" }), "profile", "Shubham"],
    ["last name", field({ id: "last_name", label: "Last Name" }), "profile", "Muthreja"],
    ["email", field({ id: "email", label: "Email" }), "profile", "shubham@muthreja.com"],
    ["phone", field({ id: "phone", label: "Phone" }), "profile", "+91-9566225447"],
    [
      "preferred first name",
      field({ id: "preferred_name", label: "Preferred First Name", required: false }),
      "profile",
      "Shubham",
    ],
    [
      "LinkedIn",
      field({
        label: "Would you like to include your LinkedIn profile, personal website or blog?",
        required: false,
      }),
      "profile",
      "https://linkedin.com/in/shubhammuthreja",
    ],
    [
      "current employer",
      field({ label: "Who is your current or previous employer?" }),
      "profile",
      "Qurkle",
    ],
    [
      "current title",
      field({ label: "What is your current or previous job title?" }),
      "profile",
      "Co-Founder and CTO",
    ],
    [
      "location",
      field({ id: "location", label: "Location", group: "location" }),
      "settings",
      "Gurugram, India",
    ],
    [
      "school",
      field({ id: "education.school", label: "School", group: "education" }),
      "settings",
      "SRM University",
    ],
    [
      "degree",
      field({ id: "education.degree", label: "Degree", group: "education" }),
      "settings",
      "B.Tech in Software Engineering",
    ],
    [
      "how did you hear",
      field({ label: "How did you hear about this job?" }),
      "settings",
      "LinkedIn",
    ],
    [
      "earliest start",
      field({
        label: "When is the earliest you would want to start working with us?",
        required: false,
      }),
      "settings",
      "2026-11-01",
    ],
    [
      "sponsorship (yes/no)",
      field({ label: "Do you require visa sponsorship?", type: "select", options: yesNo }),
      "settings",
      [{ label: "No", value: 0 }],
    ],
    [
      "relocation (yes/no)",
      field({ label: "Are you open to relocation for this role?", type: "select", options: yesNo }),
      "settings",
      [{ label: "Yes", value: 1 }],
    ],
    [
      "relocation (three choices)",
      field({
        label: "Do you currently live or are you willing to relocate to the job’s location?",
        type: "select",
        options: [
          { label: "I currently live in this job's location.", value: 1 },
          { label: "I am willing to relocate to this job's location.", value: 2 },
          { label: "I do not live and not willing to relocate to this job's location.", value: 3 },
        ],
      }),
      "settings",
      [{ label: "I am willing to relocate to this job's location.", value: 2 }],
    ],
    [
      "remote work",
      field({
        label:
          "If this role offers the option to work from a remote location, do you plan to work remotely?",
        type: "select",
        options: [
          { label: "Yes, I intend to work remotely.", value: 1 },
          { label: "No, I intend to work from an office location.", value: 2 },
        ],
      }),
      "settings",
      [{ label: "Yes, I intend to work remotely.", value: 1 }],
    ],
    [
      "country of residence",
      field({
        label: "Please select the country where you currently reside.",
        type: "select",
        options: [
          { label: "Germany", value: 1 },
          { label: "India", value: 2 },
        ],
      }),
      "settings",
      [{ label: "India", value: 2 }],
    ],
    [
      "countries to work in",
      field({
        label:
          "Please select the country or countries you anticipate working in for the role in which you are applying.",
        type: "multiselect",
        options: [
          { label: "India", value: 7 },
          { label: "US", value: 8 },
        ],
      }),
      "settings",
      [{ label: "India", value: 7 }],
    ],
    // Mapped, but the settings do not say: only the user can answer.
    [
      "resume (not in settings)",
      field({ id: "resume", label: "Resume/CV", type: "file" }),
      "user",
      undefined,
    ],
    [
      "discipline (not in settings)",
      field({ id: "education.discipline", label: "Discipline", group: "education" }),
      "user",
      undefined,
    ],
    // A personal detail with no rule is never sent to the model (D23).
    [
      "legal name",
      field({ label: "Legal Name (if different than above)", required: false }),
      "user",
      undefined,
    ],
    [
      "name pronunciation",
      field({
        label: "(Optional) Personal Preferences",
        description: "How do you pronounce your name?",
        required: false,
      }),
      "user",
      undefined,
    ],
    // (3) Remaining free text goes to the AI.
    ["essay", field({ label: "Why Anthropic?", type: "textarea" }), "ai", undefined],
    [
      "short free text",
      field({
        label: "Do you have any deadlines or timeline considerations we should be aware of?",
      }),
      "ai",
      undefined,
    ],
    // (4) Anything left is the user's.
    [
      "company-specific yes/no",
      field({
        label: "Have you ever interviewed at Anthropic before?",
        type: "select",
        options: yesNo,
      }),
      "user",
      undefined,
    ],
    [
      "unmapped office question",
      field({
        label: "Are you open to working in-person in one of our offices 25% of the time?",
        type: "select",
        options: yesNo,
      }),
      "user",
      undefined,
    ],
    [
      "unmapped file",
      field({ id: "portfolio_upload", label: "Writing sample", type: "file" }),
      "user",
      undefined,
    ],
  ];

  it.each(cases)("%s", (_name, f, source, value) => {
    const resolution = resolveOne(f);
    expect(resolution.source).toBe(source);
    expect(resolution.value).toEqual(value);
    expect(resolution.why.length).toBeGreaterThan(0);
  });

  it("answers a yes/no from settings only when the settings say", () => {
    const unknown: User = {
      ...user,
      settings: {
        ...user.settings,
        location: { ...user.settings.location, requiresVisaSponsorship: null },
      },
    };
    const sponsor = field({
      label: "Do you require visa sponsorship?",
      type: "select",
      options: yesNo,
    });
    const resolution = resolveOne(sponsor, unknown);
    expect([resolution.source, resolution.value]).toEqual(["user", undefined]);
  });

  it("does not guess a select when no option matches the settings", () => {
    const f = field({
      label: "Please select the country where you currently reside.",
      type: "select",
      options: [{ label: "Germany", value: 1 }],
    });
    const resolution = resolveOne(f);
    expect([resolution.source, resolution.value]).toEqual(["user", undefined]);
  });

  it("lists the required fields left without a value, with why", () => {
    const resolutions = resolveFields(
      [
        field({ id: "first_name", label: "First Name" }),
        field({ id: "q_ai", label: "AI Policy for Application", type: "select", options: yesNo }),
        field({ id: "q_opt", label: "Agreement to Arbitrate", required: false }),
      ],
      user,
    );
    expect(missingRequired(resolutions)).toEqual([
      {
        id: "q_ai",
        label: "AI Policy for Application",
        why: expect.stringMatching(/AI-policy/),
        type: "select",
        options: yesNo,
      },
    ]);
  });
});

describe("field resolution over the recorded forms", () => {
  async function resolved(board: string, jobId: string) {
    const job = { board, jobId };
    const schema = parseGreenhouseForm(job, await readFormRecording(job), "fixture");
    return new Map(resolveFields(schema.fields, user).map((r) => [r.field.id, r]));
  }

  it("holds Anthropic's AI-policy acknowledgement and arbitration agreement as user-only (D10)", async () => {
    const byId = await resolved("anthropic", "5418402008");
    expect(byId.get("question_18610019008")?.source).toBe("user"); // AI Policy for Application
    expect(byId.get("question_18610028008")?.source).toBe("user"); // read the arbitration agreement
    expect(byId.get("question_18610029008")?.source).toBe("user"); // Agreement to Arbitrate
    expect(byId.get("question_18610020008")?.source).toBe("ai"); // Why Anthropic?
  });

  it("fills Stripe's School and Degree from settings (D5)", async () => {
    const byId = await resolved("stripe", "8113337");
    expect(byId.get("education.school")).toMatchObject({
      source: "settings",
      value: "SRM University",
    });
    expect(byId.get("education.degree")?.source).toBe("settings");
    for (const id of ["veteran_status", "race", "gender"])
      expect(byId.get(id)?.source).toBe("user");
  });
});

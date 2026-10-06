import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SALARY_FLOOR_RULE_ID, updateMeRequestSchema, type User } from "@auto-apply/shared";
import { SettingsPage } from "./SettingsPage";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const quote = "from the job-search prompt";

const user: User = {
  uid: "demo-user",
  profile: {
    fullName: "Asha Rao",
    firstName: "Asha",
    lastName: "Rao",
    email: "asha@example.com",
    phone: "+91 90000 00000",
    location: "Bengaluru, India",
    links: { linkedin: "https://linkedin.com/in/asha", github: null, website: null },
    headline: "Engineering Manager",
    summary: "Builds real-time data products.",
    experience: [
      {
        company: "Streamly",
        title: "Engineering Manager",
        start: "Feb 2023",
        end: null,
        highlights: ["Grew the team to 8"],
      },
    ],
    skills: [{ category: "Languages", items: ["TypeScript", "Go"] }],
    leadership: ["Mentored 5 engineers"],
    education: [{ degree: "B.Tech", school: "IIT Delhi", startYear: 2010, endYear: 2014 }],
  },
  preferences: {
    region: "India",
    goal: { text: "Lead a product engineering team", source: quote },
    location: { accepted: ["Bengaluru"], remoteOpenTo: ["India"], source: quote },
    stack: { strong: ["TypeScript"], workingKnowledge: ["Python"], not: ["PHP"] },
    excludedTitles: { terms: ["Intern"], source: quote },
    companyBlocks: {
      categories: [
        { id: "it_services", label: "IT services", companies: ["Infosys"], source: quote },
      ],
      allowedExceptions: { companies: ["Stripe"], source: quote },
    },
    hardBlocks: [
      {
        id: "team_size",
        label: "Team smaller than the minimum",
        terms: [],
        threshold: 3,
        source: quote,
      },
      {
        id: SALARY_FLOOR_RULE_ID,
        label: "Pay below the floor",
        terms: [],
        threshold: null,
        source: quote,
      },
    ],
    languageGate: [
      {
        id: "python_primary_ic",
        label: "Python-primary IC",
        terms: ["Python"],
        cap: "APPLY",
        source: quote,
      },
    ],
    fitCriteria: [
      {
        id: "title_manager",
        label: "Engineering Manager title",
        weight: 3,
        group: "title",
        terms: ["engineering manager"],
        source: quote,
      },
      {
        id: "pure_people_management",
        label: "Pure people management",
        weight: -1,
        group: null,
        terms: [],
        source: quote,
      },
    ],
    fitCap: 10,
    verdictBands: { applyNowMinFit: 7, applyMinFit: 5, source: quote },
    tierFraming: { manager: "EM", ic: "Staff", source: quote },
  },
  settings: {
    location: {
      current: "Bengaluru, India",
      postalAddress: null,
      willingToRelocate: true,
      relocationScope: "Within India",
      workArrangement: "Hybrid",
      workAuthorizationCountries: ["India"],
      requiresVisaSponsorship: false,
      citizenship: null,
    },
    availability: { noticePeriodDays: 30, earliestStartDate: "2026-11-01" },
    education: { highestDegree: "B.Tech", school: "IIT Delhi", graduationYear: 2014 },
    experience: { totalYears: 11, peopleManagementYears: 4, largestTeamManaged: 8 },
    documents: { resumeUrl: null, coverLetter: null },
    other: { howDidYouHear: "LinkedIn", pronouns: null },
    alwaysUserOnly: ["compensation", "legal agreements"],
  },
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

interface Put {
  body: unknown;
}

/**
 * Fakes the API: `GET /api/me` answers `me()`; `PUT /api/me` records the body
 * and answers `put(body)` — by default the saved document, echoed back.
 */
function fakeApi(
  me: () => Response,
  put: (body: unknown) => Response = (body) => json({ uid: user.uid, ...savedFrom(body) }),
) {
  const puts: Put[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), location.origin).pathname;
    if (path !== "/api/me")
      return json({ error: { code: "not_found", message: "Not found" } }, 404);
    if (init?.method === "PUT") {
      const body: unknown = JSON.parse(String(init.body));
      puts.push({ body });
      return put(body);
    }
    return me();
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, puts };
}

/** What the API stores for an edit: the body, with the kept always-user-only list. */
function savedFrom(body: unknown) {
  const edits = updateMeRequestSchema.parse(body);
  return {
    ...edits,
    settings: { ...edits.settings, alwaysUserOnly: user.settings.alwaysUserOnly },
  };
}

function input(name: string): HTMLInputElement {
  return screen.getByRole("textbox", { name }) as HTMLInputElement;
}

async function loaded() {
  await screen.findByRole("heading", { name: "Profile" });
}

// The form renders about a hundred MUI inputs; jsdom is slow at that, so the
// interactive tests get more than Vitest's default 5 s under a parallel run.
describe("<SettingsPage />", { timeout: 20_000 }, () => {
  it("shows a loading state, then the profile as editable fields", async () => {
    fakeApi(() => json(user));
    render(<SettingsPage />);

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    await loaded();
    expect(input("Full name")).toHaveValue("Asha Rao");
    expect(input("Email")).toHaveValue("asha@example.com");
    expect(input("LinkedIn")).toHaveValue("https://linkedin.com/in/asha");
    expect(input("GitHub")).toHaveValue("");
    expect(input("Skills: Languages")).toHaveValue("TypeScript, Go");
    const experience = screen.getByRole("table", { name: "Experience" });
    expect(within(experience).getByRole("row", { name: /Streamly/ })).toHaveTextContent(
      "Feb 2023 – present",
    );
  });

  it("shows the preferences that drive matching as editable rubric tables", async () => {
    fakeApi(() => json(user));
    render(<SettingsPage />);
    await loaded();

    const criteria = screen.getByRole("table", { name: "Fit criteria" });
    const manager = within(criteria).getByRole("row", { name: /Engineering Manager title/ });
    expect(within(manager).getByRole("spinbutton")).toHaveValue(3);
    expect(within(manager).getByRole("textbox")).toHaveValue("engineering manager");
    expect(screen.getByRole("spinbutton", { name: "Pure people management: weight" })).toHaveValue(
      -1,
    );
    expect(
      screen.getByRole("spinbutton", { name: "Team smaller than the minimum: threshold" }),
    ).toHaveValue(3);
    expect(input("Excluded titles")).toHaveValue("Intern");
    expect(screen.getByRole("spinbutton", { name: "APPLY NOW from fit" })).toHaveValue(7);
    expect(screen.getByRole("combobox", { name: "Python-primary IC: verdict cap" })).toHaveValue(
      "APPLY",
    );
  });

  it("never offers the salary floor for editing: compensation is not stored", async () => {
    fakeApi(() => json(user));
    render(<SettingsPage />);
    await loaded();

    const blocks = screen.getByRole("table", { name: "Hard blocks" });
    const salary = within(blocks).getByRole("row", { name: /Pay below the floor/ });
    expect(within(salary).queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(salary).toHaveTextContent("Server setting");
  });

  it("shows the application settings, unanswered ones empty and user-only categories read-only", async () => {
    fakeApi(() => json(user));
    render(<SettingsPage />);
    await loaded();

    expect(screen.getByRole("spinbutton", { name: "Notice period (days)" })).toHaveValue(30);
    expect(screen.getByRole("combobox", { name: "Requires visa sponsorship" })).toHaveValue("no");
    expect(input("Postal address")).toHaveValue("");
    expect(screen.getByText("compensation")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /always/i })).not.toBeInTheDocument();
  });

  it("saves edits with PUT /api/me and confirms, showing what the API stored", async () => {
    const ui = userEvent.setup();
    const { puts } = fakeApi(() => json(user));
    render(<SettingsPage />);
    await loaded();

    await ui.clear(input("Headline"));
    await ui.paste("Staff Engineer");
    const weight = screen.getByRole("spinbutton", { name: "Engineering Manager title: weight" });
    await ui.clear(weight);
    await ui.type(weight, "4");
    await ui.click(input("Excluded titles"));
    await ui.paste(", Architect");
    await ui.selectOptions(
      screen.getByRole("combobox", { name: "Requires visa sponsorship" }),
      "yes",
    );
    await ui.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText(/Saved\. The next run uses these settings/)).toBeInTheDocument();
    expect(puts).toHaveLength(1);
    const body = updateMeRequestSchema.parse(puts[0]?.body);
    expect(body.profile.headline).toBe("Staff Engineer");
    expect(body.preferences.fitCriteria[0]?.weight).toBe(4);
    expect(body.preferences.excludedTitles.terms).toEqual(["Intern", "Architect"]);
    expect(body.settings.location.requiresVisaSponsorship).toBe(true);
    // Untouched values go back as they were; the uid and user-only list are not sent.
    expect(body.profile.email).toBe("asha@example.com");
    expect(body.settings.location.postalAddress).toBeNull();
    expect(puts[0]?.body).not.toHaveProperty("uid");
    expect(puts[0]?.body).not.toHaveProperty("settings.alwaysUserOnly");
    expect(input("Excluded titles")).toHaveValue("Intern, Architect");
  });

  it("blocks the save and marks the field when the contract rejects an edit", async () => {
    const ui = userEvent.setup();
    const { puts } = fakeApi(() => json(user));
    render(<SettingsPage />);
    await loaded();

    const applyFrom = screen.getByRole("spinbutton", { name: "APPLY from fit" });
    await ui.clear(applyFrom);
    await ui.type(applyFrom, "8");
    await ui.clear(input("Email"));
    await ui.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText(/Not saved: fix the highlighted fields/)).toBeInTheDocument();
    expect(input("Email")).toHaveAccessibleDescription("Required");
    expect(puts).toHaveLength(0);

    await ui.click(input("Email"));
    await ui.paste("asha@example.com");
    await ui.click(screen.getByRole("button", { name: "Save changes" }));
    expect(applyFrom).toHaveAccessibleDescription(
      /APPLY must start between 1 and the APPLY NOW band/,
    );
    expect(puts).toHaveLength(0);
  });

  it("shows the API's error when the save fails, keeping the edits", async () => {
    const ui = userEvent.setup();
    fakeApi(
      () => json(user),
      () =>
        json({ error: { code: "invalid_request", message: "profile.email: invalid_type" } }, 400),
    );
    render(<SettingsPage />);
    await loaded();

    await ui.click(input("Headline"));
    await ui.paste(" and mentor");
    await ui.click(screen.getByRole("button", { name: "Save changes" }));

    expect(
      await screen.findByText(/Could not save: profile\.email: invalid_type/),
    ).toBeInTheDocument();
    expect(input("Headline")).toHaveValue("Engineering Manager and mentor");
  });

  it("discards unsaved edits back to the stored values", async () => {
    const ui = userEvent.setup();
    fakeApi(() => json(user));
    render(<SettingsPage />);
    await loaded();

    await ui.type(input("Headline"), "!!!");
    await ui.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(input("Headline")).toHaveValue("Engineering Manager");
  });

  it("shows an empty state when no user document exists yet", async () => {
    fakeApi(() => json({ error: { code: "user_not_found", message: "No user document" } }, 404));
    render(<SettingsPage />);

    expect(await screen.findByText(/no profile yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Profile" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
  });

  it("shows the API's error", async () => {
    fakeApi(() =>
      json(
        { error: { code: "user_doc_invalid", message: "The stored user document is invalid" } },
        500,
      ),
    );
    render(<SettingsPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The stored user document is invalid",
    );
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { User } from "@auto-apply/shared";
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

function fakeMe(response: () => Response) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
    new URL(String(input)).pathname === "/api/me"
      ? response()
      : json({ error: { code: "not_found", message: "Not found" } }, 404),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** The value shown next to a label in one of the read-only field lists. */
function valueOf(label: string): string | null {
  const term = screen.getByText(label, { selector: "dt" });
  return term.nextElementSibling?.textContent ?? null;
}

describe("<SettingsPage />", () => {
  it("shows a loading state, then the profile from the user document", async () => {
    fakeMe(() => json(user));
    render(<SettingsPage />);

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Profile" })).toBeInTheDocument();
    expect(valueOf("Name")).toBe("Asha Rao");
    expect(valueOf("Email")).toBe("asha@example.com");
    expect(valueOf("LinkedIn")).toBe("https://linkedin.com/in/asha");
    const experience = screen.getByRole("table", { name: "Experience" });
    expect(within(experience).getByRole("row", { name: /Streamly/ })).toHaveTextContent(
      "Feb 2023 – present",
    );
  });

  it("shows the preferences that drive matching: fit criteria with weights and hard blocks", async () => {
    fakeMe(() => json(user));
    render(<SettingsPage />);

    const criteria = await screen.findByRole("table", { name: "Fit criteria" });
    expect(
      within(criteria).getByRole("row", { name: /Engineering Manager title/ }),
    ).toHaveTextContent("+3");
    expect(within(criteria).getByRole("row", { name: /Pure people management/ })).toHaveTextContent(
      "-1",
    );
    const blocks = screen.getByRole("table", { name: "Hard blocks" });
    expect(within(blocks).getByRole("row", { name: /Team smaller/ })).toHaveTextContent("3");
    expect(valueOf("Verdict bands")).toBe("APPLY NOW at 7+ · APPLY at 5+ · fit capped at 10");
  });

  it("shows the application settings, marking unanswered ones as user-only", async () => {
    fakeMe(() => json(user));
    render(<SettingsPage />);

    expect(
      await screen.findByRole("heading", { name: "Application settings" }),
    ).toBeInTheDocument();
    expect(valueOf("Notice period")).toBe("30 days");
    expect(valueOf("Requires visa sponsorship")).toBe("No");
    expect(valueOf("Postal address")).toBe("Not set · you answer this");
    expect(screen.getByText("compensation")).toBeInTheDocument();
  });

  it("is read-only: no inputs and no save", async () => {
    fakeMe(() => json(user));
    render(<SettingsPage />);
    await screen.findByRole("heading", { name: "Profile" });

    expect(screen.getByText(/read-only/i)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save/i })).not.toBeInTheDocument();
  });

  it("shows an empty state when no user document exists yet", async () => {
    fakeMe(() => json({ error: { code: "user_not_found", message: "No user document" } }, 404));
    render(<SettingsPage />);

    expect(await screen.findByText(/no profile yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Profile" })).not.toBeInTheDocument();
  });

  it("shows the API's error", async () => {
    fakeMe(() =>
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

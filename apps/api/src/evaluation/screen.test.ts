/**
 * The cheap, deterministic front of evaluation (D7): table-driven cases over
 * the seeded preferences, so every rule is exercised with the author's real
 * locations, companies and terms.
 */
import { describe, expect, it } from "vitest";
import type { Posting } from "@auto-apply/shared";
import { SEED_USER } from "../seed-user.js";
import { screenPosting, type Screening } from "./screen.js";

const preferences = SEED_USER.preferences;

function aPosting(overrides: Partial<Posting> = {}): Posting {
  return {
    ats: "greenhouse",
    board: "acme",
    jobId: "1",
    title: "Engineering Manager, Payments",
    company: "Acme",
    location: "Bengaluru, India",
    descriptionText: "Lead a team of engineers building payments.",
    applyUrl: "https://boards.greenhouse.io/acme/jobs/1",
    remote: false,
    source: "live",
    ...overrides,
  };
}

type Expected = "pass" | { blockedBy: string } | { skipped: RegExp };

function expectOutcome(screening: Screening, expected: Expected) {
  if (expected === "pass") {
    expect(screening).toEqual({ outcome: "pass" });
  } else if ("blockedBy" in expected) {
    expect(screening).toMatchObject({ outcome: "blocked", ruleId: expected.blockedBy });
  } else {
    expect(screening.outcome).toBe("skipped");
    if (screening.outcome === "skipped") expect(screening.reason).toMatch(expected.skipped);
  }
}

describe("hard block: location (onsite outside accepted locations, no relocation)", () => {
  it.each<[string, Partial<Posting>, Expected]>([
    ["an accepted city", { location: "Bengaluru, India" }, "pass"],
    ["an alias of an accepted city", { location: "Bangalore" }, "pass"],
    ["Gurgaon counts as Delhi NCR", { location: "Gurgaon, Haryana" }, "pass"],
    ["Noida counts as Delhi NCR", { location: "Noida" }, "pass"],
    ["remote open to India", { location: "Remote - India", remote: true }, "pass"],
    ["remote with no region", { location: "Remote", remote: true }, "pass"],
    ["remote worldwide", { location: "Remote - Worldwide", remote: true }, "pass"],
    ["no place named", { location: "Hybrid" }, "pass"],
    ["not stated", { location: "N/A" }, "pass"],
    [
      "an accepted city named in the title",
      { location: "Hybrid or Remote", title: "Partner Engineer (Based in Bangalore)" },
      "pass",
    ],
    ["onsite abroad", { location: "San Francisco, CA" }, { blockedBy: "location" }],
    [
      "remote restricted to another country",
      { location: "Remote - USA", remote: true },
      { blockedBy: "location" },
    ],
    [
      "several places, none accepted",
      { location: "London, UK | New York City, NY" },
      { blockedBy: "location" },
    ],
    ["one accepted place among others", { location: "Singapore; Mumbai, India" }, "pass"],
    [
      "onsite abroad with relocation support",
      { location: "Toronto, Canada", descriptionText: "We offer relocation support to Toronto." },
      "pass",
    ],
    [
      "onsite abroad, relocation explicitly not offered",
      {
        location: "Toronto, ON, CA",
        descriptionText:
          "Relocation Statement:\nThis position is not eligible for relocation assistance.",
      },
      { blockedBy: "location" },
    ],
    [
      "onsite abroad, relocation assistance",
      { location: "Dublin", descriptionText: "Relocation assistance is available." },
      "pass",
    ],
  ])("%s", (_name, overrides, expected) => {
    expectOutcome(screenPosting(aPosting(overrides), preferences), expected);
  });

  it("explains the block with the posting's location", () => {
    const screening = screenPosting(aPosting({ location: "San Francisco, CA" }), preferences);
    expect(screening).toMatchObject({ outcome: "blocked", ruleId: "location" });
    if (screening.outcome === "blocked") expect(screening.reason).toContain("San Francisco, CA");
  });

  it("says when a remote role is restricted to another country", () => {
    const screening = screenPosting(
      aPosting({ location: "Remote - USA", remote: true }),
      preferences,
    );
    if (screening.outcome !== "blocked") throw new Error("expected a block");
    expect(screening.reason).toContain("remote, not open to India: Remote - USA");
  });
});

describe("hard block: company category", () => {
  it.each<[string, Partial<Posting>, Expected]>([
    ["an IT services firm", { company: "Infosys" }, { blockedBy: "company_category" }],
    ["a bank, case-insensitively", { company: "goldman sachs" }, { blockedBy: "company_category" }],
    [
      "a bank's capability centre",
      { company: "JPMorgan Chase & Co." },
      { blockedBy: "company_category" },
    ],
    ["a product company", { company: "Razorpay" }, "pass"],
    ["a name that merely contains a blocked one", { company: "Citizen Labs" }, "pass"],
  ])("%s", (_name, overrides, expected) => {
    expectOutcome(screenPosting(aPosting(overrides), preferences), expected);
  });
});

describe("hard block: staffing agency naming a blocked client", () => {
  it.each<[string, Partial<Posting>, Expected]>([
    [
      "an agency hiring for a blocked bank",
      {
        company: "Acme Staffing Solutions",
        descriptionText: "Our client, Goldman Sachs, is hiring an Engineering Manager.",
      },
      { blockedBy: "staffing_blocked_client" },
    ],
    [
      "an agency known only from its wording, hiring for an IT services firm",
      {
        company: "TalentBridge",
        descriptionText: "We are a recruitment agency hiring on behalf of Infosys.",
      },
      { blockedBy: "staffing_blocked_client" },
    ],
    [
      "an agency with an unnamed client is allowed",
      {
        company: "Acme Staffing Solutions",
        descriptionText: "Our client, a fast-growing fintech startup, is hiring.",
      },
      "pass",
    ],
    [
      "an agency naming an allowed product company",
      { company: "Acme Recruiting", descriptionText: "Our client Razorpay is hiring." },
      "pass",
    ],
    [
      "a B2B product company naming its bank clients",
      { company: "Acme Payments", descriptionText: "Our clients include HSBC and Citi." },
      "pass",
    ],
    [
      "a product company that merely mentions a blocked one",
      {
        company: "Acme",
        descriptionText: "You will integrate with banks such as HSBC and Barclays.",
      },
      "pass",
    ],
  ])("%s", (_name, overrides, expected) => {
    expectOutcome(screenPosting(aPosting(overrides), preferences), expected);
  });

  it("names the agency and the client in the reason", () => {
    const screening = screenPosting(
      aPosting({ company: "Acme Staffing", descriptionText: "Our client is Wipro." }),
      preferences,
    );
    expect(screening.outcome === "blocked" && screening.reason).toMatch(/Acme Staffing.*Wipro/);
  });
});

describe("hard block: company size (10,000+ employees, unless a strong product company)", () => {
  it.each<[string, Partial<Posting>, Expected]>([
    [
      "a stated headcount above the threshold",
      { company: "MegaCorp", descriptionText: "Join our 50,000+ employees worldwide." },
      { blockedBy: "company_size" },
    ],
    [
      "a headcount written in thousands",
      { company: "MegaCorp", descriptionText: "We are 12k employees across 40 countries." },
      { blockedBy: "company_size" },
    ],
    [
      "a headcount below the threshold",
      { company: "Acme", descriptionText: "We are 2,500 employees strong." },
      "pass",
    ],
    [
      "an allowed strong product company is never blocked by size",
      { company: "Flipkart", descriptionText: "Join over 30,000 employees at Flipkart." },
      "pass",
    ],
    [
      "numbers about customers, not employees",
      { company: "Acme", descriptionText: "Trusted by 50,000+ businesses and 2M users." },
      "pass",
    ],
    ["no size stated is never a block", { company: "Unknown Co", descriptionText: "" }, "pass"],
  ])("%s", (_name, overrides, expected) => {
    expectOutcome(screenPosting(aPosting(overrides), preferences), expected);
  });

  it("blocks a known large non-product company from the blocked lists by size too", () => {
    const screening = screenPosting(aPosting({ company: "Accenture" }), {
      ...preferences,
      hardBlocks: preferences.hardBlocks.filter((rule) => rule.id !== "company_category"),
    });
    expect(screening).toMatchObject({ outcome: "blocked", ruleId: "company_size" });
  });
});

describe("missing data never blocks (null fallbacks)", () => {
  it.each<[string, Partial<Posting>]>([
    ["no location", { location: "" }],
    ["no description", { descriptionText: "" }],
    ["no location and no description", { location: "", descriptionText: "" }],
    ["no salary shown", { descriptionText: "Lead a team. Great benefits." }],
    ["no company size", { descriptionText: "Lead a product engineering team." }],
    ["no stack", { descriptionText: "Lead a team of engineers." }],
    ["no company name beyond the board", { company: "acme" }],
    ["nothing but a title", { location: "", descriptionText: "", company: "acme" }],
  ])("%s → not blocked", (_name, overrides) => {
    for (const options of [{}, { salaryFloorLpa: 40 }]) {
      expect(screenPosting(aPosting(overrides), preferences, options)).toEqual({ outcome: "pass" });
    }
  });
});

describe("short terms match their exact case", () => {
  it.each<[string, Partial<Posting>, Expected]>([
    ["EY as a company", { company: "EY" }, { blockedBy: "company_category" }],
    ["'ey' inside other text is not EY", { company: "Hey ey Labs" }, "pass"],
  ])("%s", (_name, overrides, expected) => {
    expectOutcome(screenPosting(aPosting(overrides), preferences), expected);
  });
});

describe("hard block: employment type and role family (from the title)", () => {
  it.each<[string, string, Expected]>([
    ["contract role", "Senior Engineer (Contract)", { blockedBy: "employment_type" }],
    ["part-time role", "Part-time Engineering Manager", { blockedBy: "employment_type" }],
    ["freelance role", "Freelance React Developer", { blockedBy: "employment_type" }],
    ["research role", "Research Engineer, Interpretability", { blockedBy: "role_family" }],
    ["data engineering role", "Senior Manager, Data Engineering", { blockedBy: "role_family" }],
    ["QA role", "QA Lead", { blockedBy: "role_family" }],
    ["DevOps role", "DevOps Engineering Manager", { blockedBy: "role_family" }],
    ["MLOps role", "MLOps Platform Lead", { blockedBy: "role_family" }],
    ["a word containing QA is not QA", "Aqaba Platform Engineer", "pass"],
    ["engineering manager", "Engineering Manager, Payments", "pass"],
  ])("%s", (_name, title, expected) => {
    expectOutcome(screenPosting(aPosting({ title }), preferences), expected);
  });
});

describe("hard blocks read from the description", () => {
  it.each<[string, string, Expected]>([
    [
      "AI strategy consulting",
      "Join our AI strategy consulting practice.",
      { blockedBy: "ai_strategy_consulting" },
    ],
    [
      "manager of managers",
      "You will be a manager of managers across three teams.",
      { blockedBy: "team_size" },
    ],
    ["10+ direct reports", "You will have 12+ direct reports.", { blockedBy: "team_size" }],
    ["a small team", "You will have 6 direct reports.", "pass"],
    [
      "8+ years of experience",
      "- 8+ years of software engineering experience",
      { blockedBy: "experience_minimum" },
    ],
    [
      "at least 10 years",
      "At least 10 years of experience building systems.",
      { blockedBy: "experience_minimum" },
    ],
    ["a 7-10 range is fine", "- 7-10 years of experience", "pass"],
    ["5+ years is fine", "- 5+ years of experience in backend development", "pass"],
    [
      "the lowest stated minimum decides",
      "- 3+ years of people management experience\n- 10+ years of engineering experience",
      "pass",
    ],
    ["years not about experience", "We have been building for 15+ years.", "pass"],
  ])("%s", (_name, descriptionText, expected) => {
    expectOutcome(screenPosting(aPosting({ descriptionText }), preferences), expected);
  });
});

describe("hard block: salary below the floor", () => {
  const floor = { salaryFloorLpa: 40 };

  it.each<[string, string, typeof floor | undefined, Expected]>([
    ["max below the floor", "Compensation: ₹25-35 LPA", floor, { blockedBy: "salary_below_floor" }],
    ["max at or above the floor", "Compensation: ₹30 - 45 LPA", floor, "pass"],
    [
      "rupees written in full",
      "Pay range: INR 2,000,000 - INR 3,000,000",
      floor,
      { blockedBy: "salary_below_floor" },
    ],
    [
      "lakhs spelled out",
      "Salary: Rs. 20 to 30 lakhs per annum",
      floor,
      { blockedBy: "salary_below_floor" },
    ],
    ["no pay shown never blocks", "Great benefits.", floor, "pass"],
    ["other currencies are not compared", "Pay range: $150,000 - $200,000", floor, "pass"],
    ["no floor configured", "Compensation: ₹10-12 LPA", undefined, "pass"],
  ])("%s", (_name, descriptionText, options, expected) => {
    expectOutcome(screenPosting(aPosting({ descriptionText }), preferences, options), expected);
  });
});

describe("titles out of target are skipped, not blocked", () => {
  it.each<[string, string, Expected]>([
    ["intern", "Software Engineer Intern (2027)", { skipped: /intern/ }],
    ["sales", "Sales Engineer", { skipped: /sales/ }],
    ["data scientist", "Senior Data Scientist", { skipped: /data scientist/ }],
    ["a slash-separated term", "Salesforce Developer", { skipped: /Salesforce/ }],
    ["a shared suffix", "PHP Developer", { skipped: /PHP developer/ }],
    ["internal is not intern", "IT Engineer, Internal AI Infrastructure", "pass"],
    ["an '-only' term needs judgement, not a keyword", "Engineering Manager, Edge SRE", "pass"],
  ])("%s", (_name, title, expected) => {
    expectOutcome(screenPosting(aPosting({ title }), preferences), expected);
  });
});

describe("rule order", () => {
  it("reports the first failing hard block, before any title skip", () => {
    const screening = screenPosting(
      aPosting({ title: "Data Engineer Intern", location: "San Francisco, CA", company: "Wipro" }),
      preferences,
    );
    expect(screening).toMatchObject({ outcome: "blocked", ruleId: "location" });
  });

  it("ignores rules it has no predicate for (left to the rubric)", () => {
    const screening = screenPosting(aPosting(), {
      ...preferences,
      hardBlocks: [{ id: "unknown_rule", label: "?", terms: [], threshold: null, source: "?" }],
    });
    expect(screening).toEqual({ outcome: "pass" });
  });

  it("does not apply a rule the preferences no longer list", () => {
    const screening = screenPosting(aPosting({ location: "San Francisco, CA" }), {
      ...preferences,
      hardBlocks: preferences.hardBlocks.filter((rule) => rule.id !== "location"),
    });
    expect(screening).toEqual({ outcome: "pass" });
  });
});

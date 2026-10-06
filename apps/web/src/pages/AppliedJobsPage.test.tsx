import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Evaluation, SimulatedSubmission } from "@auto-apply/shared";
import { AppliedJobsPage } from "./AppliedJobsPage";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function aSubmission(jobId: string, attempt = 1): SimulatedSubmission {
  return {
    ats: "greenhouse",
    endpoint: `https://boards-api.greenhouse.io/v1/boards/acme/jobs/${jobId}`,
    method: "POST",
    sent: false,
    formUrl: `https://job-boards.greenhouse.io/acme/jobs/${jobId}`,
    payload: { first_name: "Shubham", question_7: 0 },
    answers: [
      { id: "first_name", label: "First Name", type: "text", source: "profile", value: "Shubham" },
      {
        id: "question_7",
        label: "Will you require visa sponsorship?",
        type: "select",
        source: "settings",
        value: [{ label: "No", value: 0 }],
      },
    ],
    attempt,
    builtAt: "2026-10-06T12:00:00.000Z",
  };
}

function anEvaluation(jobId: string, overrides: Partial<Evaluation> = {}): Evaluation {
  return {
    jobKey: `greenhouse:acme:${jobId}`,
    runId: "run-1",
    posting: {
      ats: "greenhouse",
      board: "acme",
      jobId,
      title: `Engineering Manager ${jobId}`,
      company: "Acme",
      location: "Bengaluru, India",
      descriptionText: "Lead a team.",
      applyUrl: `https://boards.greenhouse.io/acme/jobs/${jobId}`,
      remote: false,
      source: "fixture",
    },
    status: "submitted",
    verdict: "APPLY_NOW",
    score: 8,
    reason: null,
    evidence: [],
    scoredBy: "fallback",
    missingFields: [],
    submission: aSubmission(jobId),
    createdAt: "2026-10-06T12:00:00.000Z",
    updatedAt: "2026-10-06T12:00:00.000Z",
    ...overrides,
  };
}

const failedOnPurpose = anEvaluation("1", { status: "failed", reason: "simulated" });
const submitted = anEvaluation("2");
const blocked = anEvaluation("3", {
  status: "blocked",
  verdict: "BLOCKED",
  reason: "Location outside India",
  submission: null,
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function fakeApi({
  evaluations = [failedOnPurpose, submitted, blocked],
  evaluationsResponse,
  retryResponse = () =>
    json({
      evaluation: {
        ...failedOnPurpose,
        status: "submitted",
        reason: null,
        submission: aSubmission("1", 2),
      },
    }),
}: {
  evaluations?: Evaluation[];
  evaluationsResponse?: () => Response;
  retryResponse?: () => Response;
} = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/evaluations") {
      return evaluationsResponse ? evaluationsResponse() : json({ evaluations });
    }
    if (url.pathname.endsWith("/retry") && init?.method === "POST") return retryResponse();
    return json({ error: { code: "not_found", message: "Not found" } }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function rowFor(title: string): Promise<HTMLElement> {
  const table = await screen.findByRole("table", { name: "Applied jobs" });
  const row = within(table)
    .getAllByRole("row")
    .find((r) => r.textContent?.includes(title));
  if (!row) throw new Error(`no row for ${title}`);
  return row;
}

describe("<AppliedJobsPage />", () => {
  it("says plainly that every submission is simulated and never sent (D18)", async () => {
    fakeApi();
    render(<AppliedJobsPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/simulated/i);
    expect(screen.getByRole("alert")).toHaveTextContent(/never sent/i);
  });

  it("lists the jobs a submit was attempted for, not the rest", async () => {
    fakeApi();
    render(<AppliedJobsPage />);

    expect(await rowFor("Engineering Manager 1")).toHaveTextContent("Simulated failure (demo)");
    expect(await rowFor("Engineering Manager 2")).toHaveTextContent(/submitted.*simulated/i);
    expect(screen.queryByText("Engineering Manager 3")).not.toBeInTheDocument();
  });

  it("shows the built payload with the form's field ids, marked not sent", async () => {
    fakeApi();
    render(<AppliedJobsPage />);
    const row = await rowFor("Engineering Manager 2");

    await userEvent.click(within(row).getByRole("button", { name: /view payload/i }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Not sent");
    expect(dialog).toHaveTextContent("https://boards-api.greenhouse.io/v1/boards/acme/jobs/2");
    expect(dialog).toHaveTextContent("question_7");
    expect(dialog).toHaveTextContent("Will you require visa sponsorship?");
    expect(dialog).toHaveTextContent('"first_name": "Shubham"');
  });

  it("retries the simulated failure and shows it submitted (D19)", async () => {
    const fetchMock = fakeApi();
    render(<AppliedJobsPage />);
    const row = await rowFor("Engineering Manager 1");
    expect(
      within(await rowFor("Engineering Manager 2")).queryByRole("button", { name: /retry/i }),
    ).toBeNull();

    await userEvent.click(within(row).getByRole("button", { name: /retry/i }));

    expect(await rowFor("Engineering Manager 1")).toHaveTextContent(/submitted.*simulated/i);
    expect(
      within(await rowFor("Engineering Manager 1")).queryByRole("button", { name: /retry/i }),
    ).toBeNull();
    const call = fetchMock.mock.calls.find(([input]) => String(input).endsWith("/retry"));
    expect(String(call?.[0])).toContain("/api/runs/run-1/jobs/greenhouse%3Aacme%3A1/retry");
  });

  it("shows why a Retry did not work", async () => {
    fakeApi({
      retryResponse: () =>
        json(
          { error: { code: "not_retryable", message: "Only a simulated failure can be retried" } },
          409,
        ),
    });
    render(<AppliedJobsPage />);
    const row = await rowFor("Engineering Manager 1");

    await userEvent.click(within(row).getByRole("button", { name: /retry/i }));

    expect(await screen.findByText(/only a simulated failure can be retried/i)).toBeInTheDocument();
  });

  it("renders an empty state before anything was submitted", async () => {
    fakeApi({ evaluations: [blocked] });
    render(<AppliedJobsPage />);

    expect(await screen.findByText("No applications yet")).toBeInTheDocument();
  });

  it("renders an error when the list cannot be loaded", async () => {
    fakeApi({
      evaluationsResponse: () =>
        json({ error: { code: "internal", message: "Internal server error" } }, 500),
    });
    render(<AppliedJobsPage />);

    expect(await screen.findByText(/could not load applied jobs/i)).toBeInTheDocument();
  });
});

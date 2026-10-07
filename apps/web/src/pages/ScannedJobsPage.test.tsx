import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyFunnel, type Evaluation, type Run } from "@auto-apply/shared";
import { ScannedJobsPage } from "./ScannedJobsPage";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function aRun(runId: string, createdAt: string): Run {
  return {
    runId,
    uid: "demo-user",
    status: "completed",
    funnel: emptyFunnel(),
    reason: null,
    createdAt,
    updatedAt: createdAt,
  };
}

function anEvaluation(
  runId: string,
  jobId: string,
  overrides: Partial<Evaluation> = {},
): Evaluation {
  return {
    jobKey: `greenhouse:acme:${jobId}`,
    runId,
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
      source: "live",
    },
    status: "blocked",
    verdict: "BLOCKED",
    score: null,
    reason: "Location outside India",
    evidence: [],
    scoredBy: null,
    missingFields: [],
    submission: null,
    draft: null,
    createdAt: "2026-10-06T12:00:00.000Z",
    updatedAt: "2026-10-06T12:00:00.000Z",
    ...overrides,
  };
}

const heldApply = anEvaluation("run-new", "2", {
  status: "held",
  verdict: "APPLY",
  score: 6,
  reason: "below_auto_threshold",
  scoredBy: "fallback",
  evidence: [
    {
      criterionId: "title_em",
      label: "Engineering Manager title",
      weight: 3,
      judgedBy: "code",
      met: true,
      evidence: "Engineering Manager 2",
      points: 3,
    },
    {
      criterionId: "startup",
      label: "Startup or scale-up",
      weight: 1,
      judgedBy: "ai",
      met: false,
      evidence: "",
      points: 0,
    },
  ],
});
const blocked = anEvaluation("run-old", "1");

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** A fake API: the Runs list, and Evaluations per run id (`all` for no filter). */
function fakeApi({
  runs = [aRun("run-new", "2026-10-06T09:00:00.000Z"), aRun("run-old", "2026-10-05T09:00:00.000Z")],
  evaluations = { all: [heldApply, blocked], "run-old": [blocked] } as Record<string, Evaluation[]>,
  evaluationsResponse,
}: {
  runs?: Run[];
  evaluations?: Record<string, Evaluation[]>;
  evaluationsResponse?: () => Response;
} = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), location.origin);
    if (url.pathname === "/api/runs") return json({ runs });
    if (url.pathname === "/api/evaluations") {
      if (evaluationsResponse) return evaluationsResponse();
      return json({ evaluations: evaluations[url.searchParams.get("runId") ?? "all"] ?? [] });
    }
    return json({ error: { code: "not_found", message: "Not found" } }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** The body rows of the Scanned jobs table that name a job. */
async function jobRows(): Promise<HTMLElement[]> {
  const table = await screen.findByRole("table", { name: "Scanned jobs" });
  return within(table)
    .getAllByRole("row")
    .filter((row) => /Engineering Manager/.test(row.textContent ?? ""));
}

describe("<ScannedJobsPage />", () => {
  it("shows a loading state, then every Evaluation across Runs with verdict, status, reason and scoring label", async () => {
    fakeApi();
    render(<ScannedJobsPage />);

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    const [first, second] = await jobRows();

    expect(first).toHaveTextContent("Engineering Manager 2");
    expect(first).toHaveTextContent("APPLY");
    expect(first).toHaveTextContent("6");
    expect(first).toHaveTextContent("Needs you");
    expect(first).toHaveTextContent("Good match, below the auto-apply threshold");
    expect(first).toHaveTextContent("fallback scoring");
    expect(second).toHaveTextContent("Engineering Manager 1");
    expect(second).toHaveTextContent("BLOCKED");
    expect(second).toHaveTextContent("Blocked");
    expect(second).toHaveTextContent("Location outside India");
  });

  it("reveals the per-criterion evidence behind a score", async () => {
    fakeApi();
    render(<ScannedJobsPage />);
    await jobRows();

    await userEvent.click(
      screen.getByRole("button", { name: "Show evidence for Engineering Manager 2" }),
    );

    const evidence = screen.getByRole("table", { name: "Evidence for Engineering Manager 2" });
    const [, met, unmet] = within(evidence).getAllByRole("row");
    expect(met).toHaveTextContent("Engineering Manager title");
    expect(met).toHaveTextContent("Code");
    expect(met).toHaveTextContent("Met");
    expect(met).toHaveTextContent("“Engineering Manager 2”");
    expect(met).toHaveTextContent("+3");
    expect(unmet).toHaveTextContent("Startup or scale-up");
    expect(unmet).toHaveTextContent("Keyword matcher");
    expect(unmet).toHaveTextContent("Not met");
  });

  it("says when a job was never scored instead of showing an empty evidence table", async () => {
    fakeApi();
    render(<ScannedJobsPage />);
    await jobRows();

    await userEvent.click(
      screen.getByRole("button", { name: "Show evidence for Engineering Manager 1" }),
    );

    expect(screen.getByText(/not scored/i)).toBeInTheDocument();
  });

  it("narrows the list to a selected Run", async () => {
    const fetchMock = fakeApi();
    render(<ScannedJobsPage />);
    await jobRows();

    await userEvent.click(screen.getByRole("combobox", { name: "Run" }));
    await userEvent.click(await screen.findByRole("option", { name: /5 Oct 2026/ }));

    await vi.waitFor(async () => expect(await jobRows()).toHaveLength(1));
    expect((await jobRows())[0]).toHaveTextContent("Engineering Manager 1");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/evaluations?runId=run-old"),
      expect.anything(),
    );
  });

  it("lists no seen-earlier rows, even ones stored before Seen jobs stopped being recorded", async () => {
    const legacySeen = anEvaluation("run-old", "3", {
      status: "skipped",
      verdict: null,
      reason: "seen",
    });
    fakeApi({ evaluations: { all: [heldApply, legacySeen, blocked] } });
    render(<ScannedJobsPage />);

    const rows = await jobRows();

    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Engineering Manager 2"),
      expect.stringContaining("Engineering Manager 1"),
    ]);
    expect(screen.queryByText(/seen in an earlier run/i)).not.toBeInTheDocument();
  });

  it("labels a Run that used the demo preferences preset in the Run picker", async () => {
    fakeApi({
      runs: [
        { ...aRun("run-new", "2026-10-06T09:00:00.000Z"), preferencesPreset: "demo" },
        aRun("run-old", "2026-10-05T09:00:00.000Z"),
      ],
    });
    render(<ScannedJobsPage />);
    await jobRows();

    await userEvent.click(screen.getByRole("combobox", { name: "Run" }));

    expect(
      await screen.findByRole("option", { name: /6 Oct 2026.*Demo preferences/ }),
    ).toBeVisible();
    expect(screen.getByRole("option", { name: /5 Oct 2026/ })).not.toHaveTextContent(/demo/i);
  });

  it("shows an empty state before anything was scanned", async () => {
    fakeApi({ runs: [], evaluations: {} });
    render(<ScannedJobsPage />);

    expect(await screen.findByText(/no jobs scanned yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows the API's error instead of an empty list", async () => {
    fakeApi({
      evaluationsResponse: () =>
        json({ error: { code: "internal", message: "Internal server error" } }, 500),
    });
    render(<ScannedJobsPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Internal server error");
    expect(screen.queryByText(/no jobs scanned yet/i)).not.toBeInTheDocument();
  });

  it("finishes a needs_you job with Answer and submit, then shows it submitted with its payload", async () => {
    const needsYou = anEvaluation("run-new", "3", {
      status: "held",
      verdict: "APPLY_NOW",
      reason: "needs_you",
      missingFields: [
        {
          id: "question_5",
          label: "Do you live within 35 miles of New York City?",
          why: "Only you can answer this",
          type: "select",
          options: [
            { label: "Yes", value: 1 },
            { label: "No", value: 0 },
          ],
        },
      ],
      draft: { formUrl: "https://job-boards.greenhouse.io/acme/jobs/3", answers: [] },
    });
    const submitted: Evaluation = {
      ...needsYou,
      status: "submitted",
      reason: null,
      missingFields: [],
      submission: {
        ats: "greenhouse",
        endpoint: "https://boards-api.greenhouse.io/v1/boards/acme/jobs/3",
        method: "POST",
        sent: false,
        formUrl: "https://job-boards.greenhouse.io/acme/jobs/3",
        payload: { question_5: 0 },
        answers: [
          {
            id: "question_5",
            label: "Do you live within 35 miles of New York City?",
            type: "select",
            source: "user",
            value: [{ label: "No", value: 0 }],
          },
        ],
        attempt: 1,
        builtAt: "2026-10-06T12:00:00.000Z",
      },
    };
    const fetchMock = fakeApi({ evaluations: { all: [needsYou] } });
    const listOnly = fetchMock.getMockImplementation();
    fetchMock.mockImplementation(async (input: RequestInfo | URL) =>
      String(input).endsWith("/answers")
        ? json({ evaluation: submitted })
        : (listOnly?.(input) ?? json({}, 500)),
    );
    const user = userEvent.setup();
    render(<ScannedJobsPage />);
    const [row] = await jobRows();
    if (!row) throw new Error("no row");

    await user.click(within(row).getByRole("button", { name: "Answer and submit" }));
    const dialog = await screen.findByRole("dialog", { name: /Answer and submit/ });
    await user.selectOptions(within(dialog).getByRole("combobox", { name: /35 miles/ }), "No");
    await user.click(within(dialog).getByRole("button", { name: "Submit (simulated)" }));

    const payload = await screen.findByRole("dialog", { name: /Payload/ });
    expect(payload).toHaveTextContent("question_5");
    expect(payload).toHaveTextContent("You");
    await user.click(within(payload).getByRole("button", { name: "Close" }));
    expect((await jobRows())[0]).toHaveTextContent(/Submitted.*simulated/);
  });
});

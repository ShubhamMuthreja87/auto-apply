import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyFunnel, type Evaluation, type Run, type RunFunnel } from "@auto-apply/shared";
import { FakeEventSource } from "../test/fake-event-source";
import { RunPanel } from "./RunPanel";

function aRun(overrides: Partial<Run> = {}): Run {
  return {
    runId: "run-1",
    uid: "demo-user",
    status: "discovering",
    funnel: emptyFunnel(),
    reason: null,
    createdAt: "2026-10-06T12:00:00.000Z",
    updatedAt: "2026-10-06T12:00:00.000Z",
    ...overrides,
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
      title: `Engineer ${jobId}`,
      company: "Acme",
      location: "Remote",
      descriptionText: "Build things.",
      applyUrl: `https://boards.greenhouse.io/acme/jobs/${jobId}`,
      remote: true,
      source: "live",
    },
    status: "queued",
    verdict: null,
    score: null,
    reason: null,
    evidence: [],
    scoredBy: null,
    missingFields: [],
    submission: null,
    createdAt: "2026-10-06T12:00:00.000Z",
    updatedAt: "2026-10-06T12:00:00.000Z",
    ...overrides,
  };
}

function funnel(counts: Partial<RunFunnel>): RunFunnel {
  return { ...emptyFunnel(), ...counts };
}

/** A fake API: the active Run on load, and what `POST /api/runs` answers. */
function fakeApi({
  active = null,
  runs = active ? [active] : [],
  post = new Response(JSON.stringify({ runId: "run-1" }), { status: 202 }),
}: { active?: Run | null; runs?: Run[]; post?: Response } = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/runs/active")) {
      return new Response(JSON.stringify({ run: active }), { status: 200 });
    }
    if (url.endsWith("/api/runs") && init?.method === "POST") return post;
    if (url.endsWith("/api/runs")) return new Response(JSON.stringify({ runs }), { status: 200 });
    return new Response("not found", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** The value shown for a funnel count or status, found by its label. */
function valueOf(label: string | RegExp): string | null {
  const term = screen.getByText(label, { selector: "dt" });
  return term.nextElementSibling?.textContent ?? null;
}

/** The body rows of the jobs table. */
function jobRows(): HTMLElement[] {
  const table = screen.getByRole("table", { name: /jobs/i });
  return within(table).getAllByRole("row").slice(1);
}

function connection(): string | null {
  return screen.getByTestId("connection").textContent;
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("<RunPanel />", () => {
  it("shows an empty state before the first Run", async () => {
    fakeApi();
    render(<RunPanel />);

    expect(await screen.findByText(/no runs yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /auto-apply/i })).toBeEnabled();
    expect(screen.queryByTestId("connection")).not.toBeInTheDocument();
  });

  it("lists each job with company, role, source, verdict, score, status and reason", async () => {
    fakeApi({ active: aRun({ status: "applying" }) });
    render(<RunPanel />);
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));

    act(() =>
      FakeEventSource.latest().emit("snapshot", {
        run: aRun({ status: "applying" }),
        evaluations: [
          anEvaluation("1", {
            status: "submitted",
            verdict: "APPLY_NOW",
            score: 87,
            reason: "strong match",
          }),
        ],
      }),
    );

    const table = screen.getByRole("table", { name: /jobs/i });
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((th) => th.textContent);
    expect(headers).toEqual(["Company", "Role", "Source", "Verdict", "Score", "Status", "Reason"]);
    const cells = within(jobRows()[0])
      .getAllByRole("cell")
      .map((td) => td.textContent);
    expect(cells).toEqual([
      "Acme",
      "Engineer 1",
      expect.stringMatching(/greenhouse/i),
      "APPLY NOW",
      "87",
      expect.stringMatching(/submitted.*simulated/i),
      "strong match",
    ]);
  });

  it("labels jobs read from recorded fixtures instead of the live board (D3)", async () => {
    fakeApi({ active: aRun() });
    render(<RunPanel />);
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));

    const withSource = (jobId: string, source: "live" | "fallback" | "fixture") => {
      const evaluation = anEvaluation(jobId);
      return { ...evaluation, posting: { ...evaluation.posting, source } };
    };
    act(() =>
      FakeEventSource.latest().emit("snapshot", {
        run: aRun(),
        evaluations: [
          withSource("1", "live"),
          withSource("2", "fallback"),
          withSource("3", "fixture"),
        ],
      }),
    );

    const sourceCells = jobRows().map((row) => within(row).getAllByRole("cell")[2]?.textContent);
    expect(sourceCells[0]).not.toMatch(/fallback|fixture/i);
    expect(sourceCells[1]).toMatch(/fallback/i);
    expect(sourceCells[2]).toMatch(/fixture/i);
  });

  it("says the whole Run uses fallback scoring when no AI key is configured (D24)", async () => {
    fakeApi({ active: aRun({ scoring: "fallback" }) });
    render(<RunPanel />);
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));

    act(() =>
      FakeEventSource.latest().emit("snapshot", {
        run: aRun({ scoring: "fallback" }),
        evaluations: [],
      }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(/fallback scoring/i);
    expect(screen.getByRole("alert")).toHaveTextContent(/no ai key/i);
  });

  it("shows no fallback notice for an AI-scored Run", async () => {
    fakeApi({ active: aRun({ scoring: "ai" }) });
    render(<RunPanel />);
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));

    act(() =>
      FakeEventSource.latest().emit("snapshot", { run: aRun({ scoring: "ai" }), evaluations: [] }),
    );

    expect(screen.queryByText(/fallback scoring/i)).not.toBeInTheDocument();
  });

  it("shows progress through the Run's jobs", async () => {
    fakeApi({ active: aRun() });
    render(<RunPanel />);
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));

    act(() =>
      FakeEventSource.latest().emit("snapshot", {
        run: aRun({
          status: "evaluating",
          funnel: funnel({ discovered: 4, skipped: 1, blocked: 1 }),
        }),
        evaluations: [],
      }),
    );

    expect(screen.getByRole("progressbar", { name: /run progress/i })).toHaveAttribute(
      "aria-valuenow",
      "50",
    );
  });

  it("starts a Run on click and opens its stream with credentials", async () => {
    const fetchMock = fakeApi();
    render(<RunPanel />);

    await userEvent.click(await screen.findByRole("button", { name: /auto-apply/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/runs$/),
      expect.objectContaining({ method: "POST" }),
    );
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    expect(FakeEventSource.latest().url).toBe("/api/runs/run-1/events");
    expect(FakeEventSource.latest().withCredentials).toBe(true);
    expect(connection()).toMatch(/^connecting/i);
  });

  it("renders the live Run status and funnel counts as events arrive", async () => {
    fakeApi();
    render(<RunPanel />);
    await userEvent.click(await screen.findByRole("button", { name: /auto-apply/i }));
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const stream = FakeEventSource.latest();

    act(() => stream.emit("snapshot", { run: aRun(), evaluations: [] }));
    expect(valueOf("Status")).toBe("Discovering");
    expect(connection()).toMatch(/live/i);

    act(() => {
      stream.emit("eval", anEvaluation("1"));
      stream.emit("run", aRun({ status: "evaluating", funnel: funnel({ discovered: 1 }) }));
      stream.emit("eval", anEvaluation("1", { status: "skipped", reason: "not a fit" }));
    });
    expect(valueOf("Status")).toBe("Evaluating");
    expect(valueOf("Discovered")).toBe("1");
    const [row] = jobRows();
    expect(row).toHaveTextContent("Engineer 1");
    expect(within(row).getByTestId("status-chip")).toHaveTextContent("Skipped");
    expect(row).toHaveTextContent(/not a fit/);
  });

  it("keeps the button disabled while the Run is active, and closes the stream on done", async () => {
    fakeApi();
    render(<RunPanel />);
    const button = await screen.findByRole("button", { name: /auto-apply/i });
    await userEvent.click(button);
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const stream = FakeEventSource.latest();

    act(() => stream.emit("snapshot", { run: aRun(), evaluations: [] }));
    expect(button).toBeDisabled();

    act(() => {
      stream.emit("run", aRun({ status: "completed", funnel: funnel({ submitted: 2 }) }));
      stream.emit("done", { runId: "run-1", status: "completed" });
    });
    expect(valueOf("Status")).toBe("Completed");
    expect(valueOf(/submitted \(simulated\)/i)).toBe("2");
    expect(stream.readyState).toBe(FakeEventSource.CLOSED);
    expect(connection()).toMatch(/closed/i);
    expect(button).toBeEnabled();
  });

  it("reattaches to the active Run after a page refresh, from a full snapshot", async () => {
    fakeApi({ active: aRun({ status: "evaluating" }) });
    render(<RunPanel />);

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    expect(FakeEventSource.latest().url).toBe("/api/runs/run-1/events");
    act(() =>
      FakeEventSource.latest().emit("snapshot", {
        run: aRun({ status: "evaluating", funnel: funnel({ discovered: 2, evaluated: 1 }) }),
        evaluations: [anEvaluation("1", { status: "skipped" }), anEvaluation("2")],
      }),
    );

    expect(valueOf("Status")).toBe("Evaluating");
    expect(valueOf("Evaluated")).toBe("1");
    expect(jobRows()).toHaveLength(2);
  });

  it("shows reconnecting when the connection drops, and re-renders from the next snapshot", async () => {
    fakeApi({ active: aRun() });
    render(<RunPanel />);
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const stream = FakeEventSource.latest();
    act(() => stream.emit("snapshot", { run: aRun(), evaluations: [anEvaluation("1")] }));

    act(() => stream.drop());
    expect(connection()).toMatch(/reconnecting/i);

    act(() =>
      stream.emit("snapshot", {
        run: aRun({ status: "applying" }),
        evaluations: [anEvaluation("1", { status: "skipped" }), anEvaluation("2")],
      }),
    );
    expect(valueOf("Status")).toBe("Applying");
    expect(jobRows()).toHaveLength(2);
  });

  it("attaches to the already-active Run when the API answers 409", async () => {
    fakeApi({
      post: new Response(
        JSON.stringify({ error: { code: "run_active", message: "A run is already in progress" } }),
        { status: 409 },
      ),
    });
    render(<RunPanel />);
    const button = await screen.findByRole("button", { name: /auto-apply/i });
    // The Run started elsewhere (another tab) after this page loaded.
    fakeApi({
      active: aRun({ runId: "run-9" }),
      post: new Response(
        JSON.stringify({ error: { code: "run_active", message: "A run is already in progress" } }),
        { status: 409 },
      ),
    });

    await userEvent.click(button);

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    expect(FakeEventSource.latest().url).toMatch(/\/api\/runs\/run-9\/events$/);
  });

  it("says so when the API answers 409 but the other Run has already finished", async () => {
    fakeApi({
      active: null,
      post: new Response(
        JSON.stringify({ error: { code: "run_active", message: "A run is already in progress" } }),
        { status: 409 },
      ),
    });
    render(<RunPanel />);

    await userEvent.click(await screen.findByRole("button", { name: /auto-apply/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/finished.*try again/i);
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it("shows an error when the Run cannot be started", async () => {
    fakeApi({ post: new Response("boom", { status: 500 }) });
    render(<RunPanel />);

    await userEvent.click(await screen.findByRole("button", { name: /auto-apply/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/500/);
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it("surfaces a server error event", async () => {
    fakeApi({ active: aRun() });
    render(<RunPanel />);
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));

    act(() =>
      FakeEventSource.latest().emit("error", {
        error: { code: "subscription_error", message: "listener failed" },
      }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(/listener failed/);
  });

  it("explains a Run that a server restart interrupted, and lets the user start again", async () => {
    fakeApi({ active: aRun({ status: "evaluating" }) });
    render(<RunPanel />);
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const stream = FakeEventSource.latest();
    act(() => stream.emit("snapshot", { run: aRun({ status: "evaluating" }), evaluations: [] }));

    // The server restarts: the browser reconnects and re-snapshots the failed Run.
    act(() => stream.drop());
    expect(connection()).toMatch(/reconnecting/i);
    act(() => {
      stream.emit("snapshot", {
        run: aRun({ status: "failed", reason: "interrupted" }),
        evaluations: [],
      });
      stream.emit("done", { runId: "run-1", status: "failed" });
    });

    expect(valueOf("Status")).toBe("Failed");
    expect(screen.getByRole("alert")).toHaveTextContent(/interrupted.*server restarted/i);
    expect(connection()).toMatch(/closed/i);
    expect(screen.getByRole("button", { name: /auto-apply/i })).toBeEnabled();
  });

  it("shows the most recent Run when none is active, e.g. one a restart interrupted", async () => {
    const interrupted = aRun({
      runId: "run-9",
      status: "failed",
      reason: "interrupted",
      funnel: funnel({ discovered: 4, blocked: 1, failed: 3 }),
    });
    fakeApi({ active: null, runs: [interrupted, aRun({ runId: "run-1", status: "completed" })] });
    render(<RunPanel />);

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    expect(FakeEventSource.latest().url).toBe("/api/runs/run-9/events");
    act(() => {
      FakeEventSource.latest().emit("snapshot", { run: interrupted, evaluations: [] });
      FakeEventSource.latest().emit("done", { runId: "run-9", status: "failed" });
    });

    expect(screen.queryByText(/no runs yet/i)).not.toBeInTheDocument();
    expect(valueOf("Status")).toBe("Failed");
    expect(valueOf("Discovered")).toBe("4");
    expect(screen.getByRole("alert")).toHaveTextContent(/interrupted.*server restarted/i);
    expect(screen.getByRole("button", { name: /auto-apply/i })).toBeEnabled();
  });

  it("shows closed and an error, not endless loading, when the browser gives up on the stream", async () => {
    fakeApi({ active: aRun() });
    render(<RunPanel />);
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    expect(screen.getByText(/loading run/i)).toBeInTheDocument();

    act(() => FakeEventSource.latest().fail());

    expect(connection()).toMatch(/closed/i);
    expect(screen.getByRole("alert")).toHaveTextContent(/lost the live connection/i);
    expect(screen.queryByText(/loading run/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /auto-apply/i })).toBeEnabled();
  });

  it("keeps the last state and says so when the stream is lost mid-Run", async () => {
    fakeApi({ active: aRun() });
    render(<RunPanel />);
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const stream = FakeEventSource.latest();
    act(() => stream.emit("snapshot", { run: aRun(), evaluations: [anEvaluation("1")] }));

    act(() => stream.fail());

    expect(connection()).toMatch(/closed/i);
    expect(screen.getByRole("alert")).toHaveTextContent(/lost the live connection/i);
    expect(jobRows()).toHaveLength(1);
  });

  it("shows an error state, not the empty state, when the latest Run cannot be loaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 500 })),
    );
    render(<RunPanel />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load the latest run/i);
    expect(screen.queryByText(/no runs yet/i)).not.toBeInTheDocument();
  });

  it("disables the button between the click and the server's answer", async () => {
    let answer: (res: Response) => void = () => {};
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/api/runs/active")) {
        return new Response(JSON.stringify({ run: null }), { status: 200 });
      }
      if (init?.method === "POST") return new Promise<Response>((resolve) => (answer = resolve));
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<RunPanel />);
    const button = await screen.findByRole("button", { name: /auto-apply/i });

    fireEvent.click(button);
    fireEvent.click(button);

    expect(button).toBeDisabled();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    await act(async () =>
      answer(new Response(JSON.stringify({ runId: "run-1" }), { status: 202 })),
    );
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    expect(button).toBeDisabled();
  });
});

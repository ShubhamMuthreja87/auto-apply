import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
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
    },
    status: "queued",
    verdict: null,
    score: null,
    reason: null,
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
  post = new Response(JSON.stringify({ runId: "run-1" }), { status: 202 }),
}: { active?: Run | null; post?: Response } = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/runs/active")) {
      return new Response(JSON.stringify({ run: active }), { status: 200 });
    }
    if (url.endsWith("/api/runs") && init?.method === "POST") return post;
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

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("<RunPanel />", () => {
  it("starts a Run on click and opens its stream with credentials", async () => {
    const fetchMock = fakeApi();
    render(<RunPanel />);

    await userEvent.click(await screen.findByRole("button", { name: /auto-apply/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/runs$/),
      expect.objectContaining({ method: "POST" }),
    );
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    expect(FakeEventSource.latest().url).toMatch(/\/api\/runs\/run-1\/events$/);
    expect(FakeEventSource.latest().withCredentials).toBe(true);
    expect(screen.getByText(/connecting/i)).toBeInTheDocument();
  });

  it("renders the live Run status and funnel counts as events arrive", async () => {
    fakeApi();
    render(<RunPanel />);
    await userEvent.click(await screen.findByRole("button", { name: /auto-apply/i }));
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const stream = FakeEventSource.latest();

    act(() => stream.emit("snapshot", { run: aRun(), evaluations: [] }));
    expect(valueOf("Status")).toBe("Discovering");
    expect(screen.getByText(/live/i)).toBeInTheDocument();

    act(() => {
      stream.emit("eval", anEvaluation("1"));
      stream.emit("run", aRun({ status: "evaluating", funnel: funnel({ discovered: 1 }) }));
      stream.emit("eval", anEvaluation("1", { status: "skipped", reason: "not a fit" }));
    });
    expect(valueOf("Status")).toBe("Evaluating");
    expect(valueOf("Discovered")).toBe("1");
    expect(screen.getByText("Engineer 1")).toBeInTheDocument();
    expect(screen.getByText(/skipped/i, { selector: "li *" })).toBeInTheDocument();
    expect(screen.getByText(/not a fit/)).toBeInTheDocument();
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
    expect(button).toBeEnabled();
  });

  it("reattaches to the active Run after a page refresh, from a full snapshot", async () => {
    fakeApi({ active: aRun({ status: "evaluating" }) });
    render(<RunPanel />);

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    expect(FakeEventSource.latest().url).toMatch(/\/api\/runs\/run-1\/events$/);
    act(() =>
      FakeEventSource.latest().emit("snapshot", {
        run: aRun({ status: "evaluating", funnel: funnel({ discovered: 2, evaluated: 1 }) }),
        evaluations: [anEvaluation("1", { status: "skipped" }), anEvaluation("2")],
      }),
    );

    expect(valueOf("Status")).toBe("Evaluating");
    expect(valueOf("Evaluated")).toBe("1");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("shows reconnecting when the connection drops, and re-renders from the next snapshot", async () => {
    fakeApi({ active: aRun() });
    render(<RunPanel />);
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const stream = FakeEventSource.latest();
    act(() => stream.emit("snapshot", { run: aRun(), evaluations: [anEvaluation("1")] }));

    act(() => stream.drop());
    expect(screen.getByText(/reconnecting/i)).toBeInTheDocument();

    act(() =>
      stream.emit("snapshot", {
        run: aRun({ status: "applying" }),
        evaluations: [anEvaluation("1", { status: "skipped" }), anEvaluation("2")],
      }),
    );
    expect(valueOf("Status")).toBe("Applying");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
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
});

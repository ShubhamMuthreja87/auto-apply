import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { App } from "./App";

/** Signed in; answers `/api/health` with `response`; the Run panel sees no active Run. */
function mockFetch(response: Response | Promise<Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith("/api/session")
        ? new Response(JSON.stringify({ authenticated: true }), { status: 200 })
        : String(input).endsWith("/api/runs/active")
          ? new Response(JSON.stringify({ run: null }), { status: 200 })
          : response,
    ),
  );
}

function healthy() {
  return new Response(
    JSON.stringify({
      status: "ok",
      service: "auto-apply-api",
      namespace: "dev",
      repo: "memory",
      time: new Date().toISOString(),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

/** Renders the app at `path` and waits past the session check to the shell. */
async function renderAt(path: string) {
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
  await screen.findByRole("banner");
  return view;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("<App />", () => {
  it("frames every page in the shell: product name, prototype badge, nav and simulated-submit footer", async () => {
    mockFetch(healthy());
    await renderAt("/");

    expect(screen.getByRole("banner")).toHaveTextContent("AI Auto-apply");
    expect(screen.getByRole("banner")).toHaveTextContent("Prototype");
    for (const name of ["Run", "Applied jobs", "Scanned jobs", "Settings"]) {
      expect(screen.getByRole("tab", { name })).toBeInTheDocument();
    }
    expect(screen.getByRole("contentinfo")).toHaveTextContent(
      "Submissions are simulated · payloads are built and stored, never sent",
    );
    expect(await screen.findByRole("button", { name: /auto-apply/i })).toBeInTheDocument();
  });

  it("navigates between the views from the tabs", async () => {
    mockFetch(healthy());
    await renderAt("/");

    expect(screen.getByRole("tab", { name: "Run" })).toHaveAttribute("aria-selected", "true");
    await userEvent.click(screen.getByRole("tab", { name: "Applied jobs" }));

    expect(screen.getByRole("heading", { name: "Applied jobs" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Applied jobs" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.queryByRole("button", { name: /auto-apply/i })).not.toBeInTheDocument();
  });

  it("shows a loading state, then the API health in the footer", async () => {
    // The health answer is held back until the shell is up, to see the loading state.
    let answer: (response: Response) => void = () => {};
    mockFetch(new Promise<Response>((resolve) => (answer = resolve)));
    await renderAt("/");
    expect(screen.getByText(/checking api/i)).toBeInTheDocument();
    answer(healthy());

    await waitFor(() => expect(screen.getByText(/namespace dev/i)).toBeInTheDocument());
    expect(screen.queryByText(/checking api/i)).not.toBeInTheDocument();
    // ADR-0004: an in-memory store is called out, never mistaken for persistence.
    expect(screen.getByText(/in-memory \(not persisted\)/i)).toBeInTheDocument();
  });

  it.each([
    ["/scanned", "Scanned jobs"],
    ["/settings", "Settings"],
  ])("routes %s to its built view, not the placeholder", async (path, heading) => {
    mockFetch(healthy());
    await renderAt(path);

    expect(screen.getByRole("heading", { name: heading, level: 1 })).toBeInTheDocument();
    expect(screen.queryByText("Not built yet")).not.toBeInTheDocument();
  });

  it("shows an error state when the API responds with a failure", async () => {
    mockFetch(new Response("boom", { status: 500 }));
    await renderAt("/settings");

    const footer = screen.getByRole("contentinfo");
    await waitFor(() => expect(within(footer).getByRole("alert")).toBeInTheDocument());
    expect(within(footer).getByRole("alert")).toHaveTextContent("500");
  });
});

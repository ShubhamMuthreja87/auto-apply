import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { App } from "./App";

/** Answers `/api/health` with `response`; the Run panel sees no active Run. */
function mockFetch(response: Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith("/api/runs/active")
        ? new Response(JSON.stringify({ run: null }), { status: 200 })
        : response,
    ),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("<App />", () => {
  it("shows a loading state, then the health data on success", async () => {
    mockFetch(
      new Response(
        JSON.stringify({
          status: "ok",
          service: "auto-apply-api",
          namespace: "dev",
          repo: "memory",
          time: new Date().toISOString(),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(<App />);
    expect(screen.getByRole("status")).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText("dev")).toBeInTheDocument());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    // ADR-0004: an in-memory store is called out, never mistaken for persistence.
    expect(screen.getByText(/in-memory \(not persisted\)/i)).toBeInTheDocument();
  });

  it("shows an error state when the API responds with a failure", async () => {
    mockFetch(new Response("boom", { status: 500 }));

    render(<App />);

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent("500");
  });
});

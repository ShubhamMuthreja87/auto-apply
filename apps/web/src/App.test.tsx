import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { App } from "./App";

function mockFetch(response: Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => response),
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
          time: new Date().toISOString(),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(<App />);
    expect(screen.getByRole("status")).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText("dev")).toBeInTheDocument());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows an error state when the API responds with a failure", async () => {
    mockFetch(new Response("boom", { status: 500 }));

    render(<App />);

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent("500");
  });
});

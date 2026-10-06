/**
 * The login gate at the component seam (D26): a signed-out browser lands on
 * the login page, signing in returns it to where it was, any `401` from the
 * API sends it back to login, and logout clears the session.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { App } from "../App";
import { FakeEventSource } from "../test/fake-event-source";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const unauthenticated = () =>
  json({ error: { code: "unauthenticated", message: "Sign in to continue" } }, 401);

interface FakeApiOptions {
  signedIn?: boolean;
  password?: string;
  /** Overrides for other paths, e.g. a 401 from `/api/me`. */
  routes?: Record<string, () => Response>;
}

/**
 * A fake API with a session: `POST /api/login` with the right password signs
 * in, `POST /api/logout` signs out, protected paths answer 401 when signed out.
 */
function fakeApi({ signedIn = false, password = "correct", routes = {} }: FakeApiOptions = {}) {
  let session = signedIn;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path =
      String(input)
        .replace(/^https?:\/\/[^/]+/, "")
        .split("?")[0] ?? "";
    if (path === "/api/login") {
      const body = JSON.parse(String(init?.body)) as { username: string; password: string };
      if (body.password !== password) {
        return json({ error: { code: "invalid_credentials", message: "Wrong" } }, 401);
      }
      session = true;
      return json({ authenticated: true });
    }
    if (path === "/api/logout") {
      session = false;
      return new Response(null, { status: 204 });
    }
    if (path === "/api/health") {
      return json({ status: "ok", service: "api", namespace: "dev", repo: "memory", time: "t" });
    }
    if (!session) return unauthenticated();
    const override = routes[path];
    if (override) return override();
    if (path === "/api/session") return json({ authenticated: true });
    if (path === "/api/runs/active") return json({ run: null });
    if (path === "/api/runs") return json({ runs: [] });
    if (path === "/api/evaluations") return json({ evaluations: [] });
    return json({ error: { code: "not_found", message: "Not found" } }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

async function signIn(password: string) {
  await userEvent.type(await screen.findByLabelText(/username/i), "jobseeker");
  await userEvent.type(screen.getByLabelText(/password/i), password);
  await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("login gate", () => {
  it("sends a signed-out browser to the login page instead of the app", async () => {
    fakeApi({ signedIn: false });
    renderAt("/scanned");

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Scanned jobs" })).not.toBeInTheDocument();
  });

  it("signs in with the credentials and returns to the page asked for", async () => {
    const fetchMock = fakeApi({ signedIn: false, password: "correct" });
    renderAt("/scanned");

    await signIn("correct");

    expect(await screen.findByRole("heading", { name: "Scanned jobs", level: 1 })).toBeVisible();
    const loginCall = fetchMock.mock.calls.find(([input]) => String(input).endsWith("/api/login"));
    expect(loginCall?.[1]?.method).toBe("POST");
    expect(loginCall?.[1]?.credentials).toBe("include");
    expect(JSON.parse(String(loginCall?.[1]?.body))).toEqual({
      username: "jobseeker",
      password: "correct",
    });
  });

  it("calls the API only at same-origin /api paths, never an absolute URL", async () => {
    const fetchMock = fakeApi({ signedIn: false, password: "correct" });
    renderAt("/");

    await signIn("correct");
    expect(await screen.findByRole("button", { name: /auto-apply/i })).toBeInTheDocument();

    // An absolute http:// API URL is blocked as mixed content on the https site.
    const urls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(urls).toContain("/api/login");
    expect(urls.filter((url) => !url.startsWith("/api/"))).toEqual([]);
  });

  it("says so on a wrong password and stays on the login page", async () => {
    fakeApi({ signedIn: false, password: "correct" });
    renderAt("/");

    await signIn("wrong");

    expect(await screen.findByRole("alert")).toHaveTextContent("Wrong username or password.");
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("shows the app straight away with a valid session", async () => {
    fakeApi({ signedIn: true });
    renderAt("/");

    expect(await screen.findByRole("button", { name: /auto-apply/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Sign in" })).not.toBeInTheDocument();
  });

  it("redirects to login when any API call answers 401 (an expired session)", async () => {
    fakeApi({ signedIn: true, routes: { "/api/me": unauthenticated } });
    renderAt("/settings");

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("redirects to login when a Retry answers 401 (an expired session)", async () => {
    const retryable = {
      jobKey: "greenhouse:acme:1",
      runId: "run-1",
      posting: {
        ats: "greenhouse",
        board: "acme",
        jobId: "1",
        title: "Engineering Manager",
        company: "Acme",
        location: "Bengaluru, India",
        descriptionText: "Lead a team.",
        applyUrl: "https://boards.greenhouse.io/acme/jobs/1",
        remote: false,
        source: "fixture",
      },
      status: "failed",
      verdict: "APPLY_NOW",
      score: 8,
      reason: "simulated",
      evidence: [],
      scoredBy: "fallback",
      missingFields: [],
      submission: {
        ats: "greenhouse",
        endpoint: "https://boards-api.greenhouse.io/v1/boards/acme/jobs/1",
        method: "POST",
        sent: false,
        formUrl: "https://job-boards.greenhouse.io/acme/jobs/1",
        payload: {},
        answers: [],
        attempt: 1,
        builtAt: "2026-10-06T12:00:00.000Z",
      },
      createdAt: "2026-10-06T12:00:00.000Z",
      updatedAt: "2026-10-06T12:00:00.000Z",
    };
    fakeApi({
      signedIn: true,
      routes: {
        "/api/evaluations": () => json({ evaluations: [retryable] }),
        "/api/runs/run-1/jobs/greenhouse%3Aacme%3A1/retry": unauthenticated,
      },
    });
    renderAt("/applied");

    await userEvent.click(await screen.findByRole("button", { name: /^retry$/i }));

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("redirects to login when the live stream fails because the session expired", async () => {
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    const run = {
      runId: "run-1",
      uid: "demo-user",
      status: "evaluating",
      funnel: {
        discovered: 2,
        evaluated: 0,
        blocked: 0,
        skipped: 0,
        held: 0,
        submitted: 0,
        failed: 0,
      },
      reason: null,
      createdAt: "2026-10-06T12:00:00.000Z",
      updatedAt: "2026-10-06T12:00:00.000Z",
    };
    let expired = false;
    fakeApi({
      signedIn: true,
      routes: {
        "/api/runs/active": () => json({ run }),
        "/api/session": () => (expired ? unauthenticated() : json({ authenticated: true })),
      },
    });
    renderAt("/");
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    act(() => FakeEventSource.latest().emit("snapshot", { run, evaluations: [] }));

    // The JWT expires; the stream's reconnect answers 401 and the browser gives up.
    expired = true;
    act(() => FakeEventSource.latest().fail());

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("logs out: clears the session on the API and shows the login page", async () => {
    const fetchMock = fakeApi({ signedIn: true });
    renderAt("/");

    await userEvent.click(await screen.findByRole("button", { name: /log out/i }));

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) => String(input).endsWith("/api/logout") && init?.method === "POST",
      ),
    ).toBe(true);
  });

  it("shows an error with a retry when the session check cannot reach the API", async () => {
    fakeApi({
      signedIn: true,
      routes: { "/api/session": () => new Response("boom", { status: 502 }) },
    });
    renderAt("/");

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not reach the api/i);
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("banner")).not.toBeInTheDocument());
  });
});

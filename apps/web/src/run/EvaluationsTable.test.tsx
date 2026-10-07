import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Evaluation, SubmittedAnswer } from "@auto-apply/shared";
import { EvaluationsTable } from "./EvaluationsTable";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function anEvaluation(overrides: Partial<Evaluation>): Evaluation {
  return {
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
    draft: null,
    createdAt: "2026-10-06T12:00:00.000Z",
    updatedAt: "2026-10-06T12:00:00.000Z",
    ...overrides,
  };
}

describe("<EvaluationsTable /> reasons", () => {
  it.each<[string, Partial<Evaluation>, string]>([
    ["a Seen skip", { status: "skipped", reason: "seen" }, "Seen in an earlier run"],
    [
      "a limit skip",
      { status: "skipped", reason: "limit" },
      "Run limit reached (15 evaluations per run)",
    ],
    [
      "a hard block, as written",
      { status: "blocked", reason: "Contract-only, part-time or freelance (contract)" },
      "Contract-only, part-time or freelance (contract)",
    ],
    ["a stretch skip", { status: "skipped", reason: "stretch" }, "Stretch or below"],
    [
      "an APPLY held below the auto threshold",
      { status: "held", reason: "below_auto_threshold" },
      "Good match, below the auto-apply threshold",
    ],
    ["no reason yet", { status: "queued", reason: null }, "—"],
  ])("shows %s", (_name, overrides, text) => {
    render(<EvaluationsTable evaluations={[anEvaluation(overrides)]} />);

    expect(screen.getByRole("row", { name: /Engineering Manager/ })).toHaveTextContent(text);
  });
});

describe("<EvaluationsTable /> needs_you (D11)", () => {
  it("lists the fields the user must answer, with why", () => {
    render(
      <EvaluationsTable
        evaluations={[
          anEvaluation({
            status: "held",
            verdict: "APPLY_NOW",
            reason: "needs_you",
            missingFields: [
              {
                id: "question_1",
                label: "Agreement to Arbitrate",
                why: "Legal agreement; never auto-answered (D10)",
                type: "boolean",
                options: [],
              },
              {
                id: "resume",
                label: "Resume/CV",
                why: "Not answered by your settings (documents.resumeUrl)",
                type: "file",
                options: [],
              },
            ],
          }),
        ]}
      />,
    );

    const row = screen.getByRole("row", { name: /Engineering Manager/ });
    expect(row).toHaveTextContent("Needs your answers");
    const list = screen.getByRole("list", { name: "Fields you need to answer" });
    expect(list).toHaveTextContent("Agreement to Arbitrate — Legal agreement; never auto-answered");
    expect(list).toHaveTextContent("Resume/CV");
  });

  it("shows no field list when nothing is missing", () => {
    render(
      <EvaluationsTable
        evaluations={[anEvaluation({ status: "held", reason: "below_auto_threshold" })]}
      />,
    );

    expect(screen.queryByRole("list", { name: "Fields you need to answer" })).toBeNull();
  });
});

describe("<EvaluationsTable /> scoring", () => {
  it("shows the Verdict and score, labelled when the keyword matcher scored it (D24)", () => {
    render(
      <EvaluationsTable
        evaluations={[
          anEvaluation({ status: "held", verdict: "APPLY", score: 6, scoredBy: "fallback" }),
        ]}
      />,
    );

    const row = screen.getByRole("row", { name: /Engineering Manager/ });
    expect(row).toHaveTextContent("APPLY");
    expect(row).toHaveTextContent("6");
    expect(row).toHaveTextContent("fallback scoring");
  });

  it("does not label a score the AI produced", () => {
    render(
      <EvaluationsTable
        evaluations={[anEvaluation({ status: "held", verdict: "APPLY", score: 6, scoredBy: "ai" })]}
      />,
    );

    expect(screen.getByRole("row", { name: /Engineering Manager/ })).not.toHaveTextContent(
      "fallback scoring",
    );
  });
});

describe("<EvaluationsTable /> Answer and submit", () => {
  const needsYou = anEvaluation({
    status: "held",
    verdict: "APPLY_NOW",
    reason: "needs_you",
    missingFields: [
      {
        id: "question_5",
        label: "Have you ever been employed by Acme?",
        why: "Only you can answer this",
        type: "select",
        options: [
          { label: "Yes", value: 1 },
          { label: "No", value: 0 },
        ],
      },
      {
        id: "question_8",
        label: "I agree to the privacy policy",
        why: "Consent or acknowledgement; never auto-answered (D10)",
        type: "boolean",
        options: [],
      },
      {
        id: "question_6",
        label: "Why Acme?",
        why: "Free text; no AI is configured, so only you can answer (D24)",
        type: "textarea",
        options: [],
      },
      {
        id: "resume",
        label: "Resume/CV",
        why: "Not answered by your settings (documents.resumeUrl)",
        type: "file",
        options: [],
      },
    ],
    draft: {
      formUrl: "https://job-boards.greenhouse.io/acme/jobs/1",
      answers: [
        { id: "first_name", label: "First Name", type: "text", source: "profile", value: "Ada" },
      ],
    },
  });

  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  /** The API answers with the job submitted (simulated), its payload built from the request. */
  function fakeApi(fail?: { status: number; code: string; message: string }) {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (fail) return json({ error: { code: fail.code, message: fail.message } }, fail.status);
      const body = JSON.parse(String(init?.body)) as { answers: Record<string, unknown> };
      const answers: SubmittedAnswer[] = [
        { id: "first_name", label: "First Name", type: "text", source: "profile", value: "Ada" },
        ...Object.entries(body.answers).map(([id, value]): SubmittedAnswer => ({
          id,
          label: id,
          type: "text",
          source: "user",
          value: String(value),
        })),
      ];
      const evaluation: Evaluation = {
        ...needsYou,
        status: "submitted",
        reason: null,
        missingFields: [],
        submission: {
          ats: "greenhouse",
          endpoint: "https://boards-api.greenhouse.io/v1/boards/acme/jobs/1",
          method: "POST",
          sent: false,
          formUrl: "https://job-boards.greenhouse.io/acme/jobs/1",
          payload: Object.fromEntries(answers.map((a) => [a.id, String(a.value)])),
          answers,
          attempt: 1,
          builtAt: "2026-10-06T12:00:00.000Z",
        },
      };
      return json({ evaluation }, 200);
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  async function openDialog() {
    const user = userEvent.setup();
    render(<EvaluationsTable evaluations={[needsYou]} />);
    const row = screen.getByRole("row", { name: /Engineering Manager/ });
    expect(row).toHaveTextContent("Needs your answers");
    await user.click(within(row).getByRole("button", { name: "Answer and submit" }));
    return { user, dialog: await screen.findByRole("dialog", { name: /Answer and submit/ }) };
  }

  async function fillAll(
    user: ReturnType<typeof userEvent.setup>,
    dialog: HTMLElement,
    choice: { employed: string; consent: string },
  ) {
    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: /employed by Acme/ }),
      choice.employed,
    );
    await user.click(within(dialog).getByRole("radio", { name: choice.consent }));
    await user.type(within(dialog).getByRole("textbox", { name: /Why Acme/ }), "Real-time systems");
    await user.type(
      within(dialog).getByRole("textbox", { name: /Resume/ }),
      "https://example.com/cv.pdf",
    );
    await user.click(within(dialog).getByRole("button", { name: "Submit (simulated)" }));
  }

  it("offers no button on a job that is not held as needs_you", () => {
    render(
      <EvaluationsTable
        evaluations={[anEvaluation({ status: "held", reason: "below_auto_threshold" })]}
      />,
    );

    expect(screen.queryByRole("button", { name: "Answer and submit" })).toBeNull();
  });

  it("renders one input per missing field, typed by the field's type", async () => {
    const { dialog } = await openDialog();

    const select = within(dialog).getByRole("combobox", { name: /employed by Acme/ });
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(expect.arrayContaining(["Yes", "No"]));
    const consent = within(dialog).getByRole("radiogroup", { name: /privacy policy/ });
    expect(within(consent).getAllByRole("radio")).toHaveLength(2);
    expect(within(dialog).getByRole("textbox", { name: /Why Acme/ })).toBeInTheDocument();
    expect(within(dialog).getByRole("textbox", { name: /Resume\/CV/ })).toHaveAttribute(
      "type",
      "url",
    );
  });

  it("checks every field is answered before it submits", async () => {
    const fetchMock = fakeApi();
    const { user, dialog } = await openDialog();

    await user.type(within(dialog).getByRole("textbox", { name: /Resume/ }), "not a link");
    await user.click(within(dialog).getByRole("button", { name: "Submit (simulated)" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(within(dialog).getAllByText("Required")).toHaveLength(3);
    expect(within(dialog).getByText(/Enter a link/)).toBeInTheDocument();
  });

  it("submits the answers, shows the row submitted and opens the payload", async () => {
    const fetchMock = fakeApi();
    const { user, dialog } = await openDialog();

    await fillAll(user, dialog, { employed: "No", consent: "Yes" });

    const payload = await screen.findByRole("dialog", { name: /Payload/ });
    expect(payload).toHaveTextContent("Not sent");
    expect(payload).toHaveTextContent("question_5");
    expect(screen.queryByRole("dialog", { name: /Answer and submit/ })).toBeNull();
    await user.click(within(payload).getByRole("button", { name: "Close" }));
    const row = screen.getByRole("row", { name: /Engineering Manager/ });
    expect(within(row).queryByRole("button", { name: "Answer and submit" })).toBeNull();
    expect(row).toHaveTextContent(/Submitted.*simulated/);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe("/api/runs/run-1/jobs/greenhouse%3Aacme%3A1/answers");
    expect(init?.credentials).toBe("include");
    expect(JSON.parse(String(init?.body))).toEqual({
      answers: {
        question_5: 0,
        question_8: 1,
        question_6: "Real-time systems",
        resume: "https://example.com/cv.pdf",
      },
    });
  });

  it("shows the server's error in the dialog", async () => {
    fakeApi({
      status: 409,
      code: "not_answerable",
      message: "Only a job that needs your answers can be answered",
    });
    const { user, dialog } = await openDialog();

    await fillAll(user, dialog, { employed: "Yes", consent: "No" });

    expect(
      await within(dialog).findByText("Only a job that needs your answers can be answered"),
    ).toBeInTheDocument();
    // The dialog stays open; the row behind it is unchanged.
    expect(
      screen.getByRole("row", { name: /Engineering Manager/, hidden: true }),
    ).toHaveTextContent("Needs your answers");
  });
});

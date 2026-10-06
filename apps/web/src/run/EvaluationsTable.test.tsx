import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Evaluation } from "@auto-apply/shared";
import { EvaluationsTable } from "./EvaluationsTable";

afterEach(cleanup);

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
              },
              {
                id: "resume",
                label: "Resume/CV",
                why: "Not answered by your settings (documents.resumeUrl)",
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

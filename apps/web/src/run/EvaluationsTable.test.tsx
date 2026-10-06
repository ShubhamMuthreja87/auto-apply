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
    ["no reason yet", { status: "queued", reason: null }, "—"],
  ])("shows %s", (_name, overrides, text) => {
    render(<EvaluationsTable evaluations={[anEvaluation(overrides)]} />);

    expect(screen.getByRole("row", { name: /Engineering Manager/ })).toHaveTextContent(text);
  });
});

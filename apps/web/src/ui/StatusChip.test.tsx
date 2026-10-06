import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { EvaluationStatus, RunStatus, Verdict } from "@auto-apply/shared";
import { StatusChip, VerdictChip } from "./StatusChip";

afterEach(cleanup);

describe("<StatusChip />", () => {
  // Colour is never the only signal: every status reads as text.
  it.each<[RunStatus | EvaluationStatus, string, boolean]>([
    ["discovering", "Discovering", true],
    ["evaluating", "Evaluating", true],
    ["applying", "Applying", true],
    ["completed", "Completed", false],
    ["queued", "Queued", false],
    ["blocked", "Blocked", false],
    ["skipped", "Skipped", false],
    ["held", "Needs you", false],
    ["submitted", "Submitted", false],
    ["failed", "Failed", false],
  ])("%s reads as %s, busy: %s", (status, label, busy) => {
    render(<StatusChip status={status} />);

    const chip = screen.getByTestId("status-chip");
    expect(chip).toHaveTextContent(label);
    expect(chip).toHaveAttribute("data-status", status);
    if (busy) expect(chip).toHaveAttribute("aria-busy", "true");
    else expect(chip).not.toHaveAttribute("aria-busy");
  });

  it("tags a submit as simulated (D18)", () => {
    render(<StatusChip status="submitted" />);

    expect(screen.getByTestId("status-chip")).toHaveTextContent(/submitted.*simulated/i);
  });
});

describe("<VerdictChip />", () => {
  it.each<[Verdict, string]>([
    ["APPLY_NOW", "APPLY NOW"],
    ["APPLY", "APPLY"],
    ["STRETCH", "STRETCH"],
    ["BLOCKED", "BLOCKED"],
  ])("%s reads as %s", (verdict, label) => {
    render(<VerdictChip verdict={verdict} />);

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("shows a dash when there is no verdict yet", () => {
    render(<VerdictChip verdict={null} />);

    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

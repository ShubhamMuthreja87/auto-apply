/**
 * The happy path, end to end, in deterministic mode (see playwright.config.ts):
 * log in, press Auto-apply, watch the Run stream through its statuses, see the
 * synthetic demo job fail on purpose (D19), Retry it on the Applied jobs page
 * and see it submitted (simulated, D18).
 */
import { expect, test } from "@playwright/test";
import { E2E_PASSWORD, E2E_USERNAME } from "./credentials";

/** The labelled synthetic board that only exists in fixtures mode (ticket 11). */
const DEMO_COMPANY = "Demo Co (synthetic)";

test("auto-apply: live run, simulated failure, Retry, submitted (simulated)", async ({ page }) => {
  // 1. Log in.
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Username").fill(E2E_USERNAME);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  // 2. Press Auto-apply.
  const panel = page.getByRole("region", { name: "Auto-apply" });
  const autoApply = panel.getByRole("button", { name: "Auto-apply" });
  await expect(autoApply).toBeEnabled();
  await autoApply.click();

  // 3. The Run streams through its statuses: in progress (the button stays
  // disabled), then completed. No AI key, so the run says it is on fallback.
  const runStatus = panel
    .locator("dl")
    .filter({ hasText: /^Status/ })
    .getByTestId("status-chip");
  await expect(runStatus).toHaveAttribute("data-status", /^(discovering|evaluating|applying)$/);
  await expect(autoApply).toBeDisabled();
  await expect(panel.getByText(/Fallback scoring: no AI key is configured/)).toBeVisible();
  // A fixtures run takes ~18 s (the pipeline's simulated per-job and submit
  // delays), close to the default expect timeout; allow headroom.
  await expect(runStatus).toHaveAttribute("data-status", "completed", { timeout: 60_000 });
  await expect(runStatus).toHaveText("Completed");
  await expect(autoApply).toBeEnabled();

  // 4. The demo job's submit is the Run's first, which fails on purpose (D19).
  const runRow = panel
    .getByRole("table", { name: "Jobs in this run" })
    .getByRole("row")
    .filter({ hasText: DEMO_COMPANY });
  await expect(runRow).toContainText("Simulated failure (demo)");
  await expect(runRow.getByTestId("status-chip")).toHaveAttribute("data-status", "failed");

  // 5. Retry it from Applied jobs.
  await page.getByRole("tab", { name: "Applied jobs" }).click();
  await expect(page.getByRole("heading", { name: "Applied jobs" })).toBeVisible();
  const appliedRow = page
    .getByRole("table", { name: "Applied jobs" })
    .getByRole("row")
    .filter({ hasText: DEMO_COMPANY });
  await expect(appliedRow).toContainText("Simulated failure (demo)");
  await appliedRow.getByRole("button", { name: "Retry" }).click();

  // 6. Submitted (simulated), and nothing left to retry.
  await expect(appliedRow).toContainText("Submitted (simulated)");
  await expect(appliedRow.getByTestId("status-chip")).toHaveAttribute("data-status", "submitted");
  await expect(appliedRow).toContainText("attempt 2");
  await expect(appliedRow.getByRole("button", { name: "Retry" })).toHaveCount(0);
});

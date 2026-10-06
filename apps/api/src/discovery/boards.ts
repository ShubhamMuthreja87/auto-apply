/**
 * The hardcoded boards discovery reads (D2): 15 public Greenhouse boards with
 * engineering, EM and Staff roles, each with a recorded response under
 * `apps/api/fixtures/greenhouse/boards/` as its D3 fallback. Greenhouse only
 * since the 2026-10-06 time cut; a Lever or Ashby board would be another entry
 * with its own adapter. Stripe and Anthropic are the boards whose application
 * forms shaped D5 and D10.
 */
import type { BoardRef } from "../pipeline/ports.js";
import type { DiscoveryMode } from "./discovery.js";

const greenhouseBoards = [
  "stripe",
  "anthropic",
  "airbnb",
  "figma",
  "dropbox",
  "discord",
  "databricks",
  "cloudflare",
  "robinhood",
  "lyft",
  "instacart",
  "pinterest",
  "reddit",
  "asana",
  "vercel",
] as const;

/** The live board registry: real public boards only. */
export const BOARDS: readonly BoardRef[] = greenhouseBoards.map((board) => ({
  ats: "greenhouse",
  board,
}));

/**
 * The synthetic demo board: hand-made fixtures (see
 * `apps/api/fixtures/greenhouse/README-demo-synthetic.md`), one job whose form
 * the seed answers in full, so a fixtures Run reaches the simulated submit
 * and D19's fail-then-Retry. Never part of {@link BOARDS}: live Runs read
 * real boards only.
 */
export const DEMO_BOARD: BoardRef = { ats: "greenhouse", board: "demo-synthetic" };

/** The boards a Run reads: the live registry, plus the demo board in fixtures mode only. */
export function boardsFor(mode: DiscoveryMode): readonly BoardRef[] {
  return mode === "fixtures" ? [...BOARDS, DEMO_BOARD] : BOARDS;
}

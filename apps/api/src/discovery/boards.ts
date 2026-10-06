/**
 * The hardcoded boards discovery reads (D2): 15 public Greenhouse boards with
 * engineering, EM and Staff roles, each with a recorded response under
 * `apps/api/fixtures/greenhouse/boards/` as its D3 fallback. Greenhouse only
 * since the 2026-10-06 time cut; a Lever or Ashby board would be another entry
 * with its own adapter. Stripe and Anthropic are the boards whose application
 * forms shaped D5 and D10.
 */
import type { BoardRef } from "../pipeline/ports.js";

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

export const BOARDS: readonly BoardRef[] = greenhouseBoards.map((board) => ({
  ats: "greenhouse",
  board,
}));

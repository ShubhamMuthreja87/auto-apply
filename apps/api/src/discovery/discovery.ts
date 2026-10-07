/**
 * Discovery across every registered board (D2, D3): each board is read live
 * through its ATS's `JobSource`; a board that fails (network, HTTP error,
 * timeout, unexpected shape) falls back to its recorded fixtures, labelled
 * `fallback`, and the Run continues. In `fixtures` mode no network is used at
 * all and every Posting is labelled `fixture` (spec, Testing seam 6). Every
 * Posting is returned, each board's together and newest first; the pipeline
 * decides how many unseen ones to take per board (`MAX_POSTINGS_PER_BOARD`).
 */
import type { Ats, Posting, PostingSource } from "@auto-apply/shared";
import { logger } from "../logger.js";
import type { BoardRef, Discovery, JobSource } from "../pipeline/ports.js";
import type { FixtureReader } from "./fixtures.js";
import { messageOf } from "../errors.js";

export type DiscoveryMode = "live" | "fixtures";

export interface DiscoveryOptions {
  sources: readonly JobSource[];
  boards: readonly BoardRef[];
  readFixture: FixtureReader;
  mode: DiscoveryMode;
}

/** What one board contributed, and whether it came live or from fixtures. */
export interface BoardDiscovery {
  ref: BoardRef;
  source: PostingSource;
  postings: Posting[];
}

export function createDiscovery(
  options: DiscoveryOptions,
): Discovery & { discoverBoards(): Promise<BoardDiscovery[]> } {
  const { boards, readFixture, mode } = options;
  const sources = new Map<Ats, JobSource>(options.sources.map((s) => [s.ats, s]));

  async function fromFixtures(
    ref: BoardRef,
    source: "fallback" | "fixture",
  ): Promise<BoardDiscovery> {
    try {
      return { ref, source, postings: await readFixture(ref, source) };
    } catch (err) {
      // Nothing left to fall back to: the board contributes no Postings and
      // the Run carries on with the others.
      logger.error("board_fixture_unavailable", { ...ref, error: messageOf(err) });
      return { ref, source, postings: [] };
    }
  }

  async function discoverBoard(ref: BoardRef): Promise<BoardDiscovery> {
    if (mode === "fixtures") return fromFixtures(ref, "fixture");
    try {
      const source = sources.get(ref.ats);
      if (!source) throw new Error(`No job source for ${ref.ats}`);
      return { ref, source: "live", postings: await source.discover(ref.board) };
    } catch (err) {
      logger.warn("board_fallback", { ...ref, reason: messageOf(err) });
      return fromFixtures(ref, "fallback");
    }
  }

  async function discoverBoards(): Promise<BoardDiscovery[]> {
    const results = await Promise.all(boards.map(discoverBoard));
    for (const result of results) {
      logger.info("board_discovered", {
        ...result.ref,
        source: result.source,
        found: result.postings.length,
      });
    }
    return results;
  }

  return {
    discoverBoards,
    async discover() {
      return (await discoverBoards()).flatMap((result) => result.postings);
    },
  };
}

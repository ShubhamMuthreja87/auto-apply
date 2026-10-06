import { describe, expect, it } from "vitest";
import type { BoardRef } from "../pipeline/ports.js";
import { createDiscovery } from "./discovery.js";
import { readBoardFixture } from "./fixtures.js";
import { greenhouseJobSource } from "./greenhouse.js";
import { recordedFetch } from "./recorded-fetch.js";

const boards: BoardRef[] = [
  { ats: "greenhouse", board: "stripe" },
  { ats: "greenhouse", board: "anthropic" },
];

function discoveryWith(options: { failing?: string[]; mode?: "live" | "fixtures" } = {}) {
  const recorded = recordedFetch({ failing: options.failing });
  const discovery = createDiscovery({
    sources: [greenhouseJobSource({ fetch: recorded.fetch, timeoutMs: 1000 })],
    boards,
    readFixture: readBoardFixture,
    mode: options.mode ?? "live",
  });
  return { discovery, calls: recorded.calls };
}

describe("discovery", () => {
  it("reads every board live and labels its Postings live", async () => {
    const { discovery } = discoveryWith();

    const results = await discovery.discoverBoards();

    expect(results.map((r) => [r.ref.board, r.source])).toEqual([
      ["stripe", "live"],
      ["anthropic", "live"],
    ]);
    const postings = await discovery.discover();
    expect(new Set(postings.map((p) => p.board))).toEqual(new Set(["stripe", "anthropic"]));
    expect(postings.every((p) => p.source === "live")).toBe(true);
  });

  it("falls back to a failed board's fixtures, labelled fallback, and keeps the others live (D3)", async () => {
    const { discovery } = discoveryWith({ failing: ["anthropic"] });

    const postings = await discovery.discover();

    const anthropic = postings.filter((p) => p.board === "anthropic");
    expect(anthropic.length).toBeGreaterThan(0);
    expect(anthropic.every((p) => p.source === "fallback")).toBe(true);
    expect(postings.filter((p) => p.board === "stripe").every((p) => p.source === "live")).toBe(
      true,
    );
  });

  it("falls back when a board has no adapter", async () => {
    const discovery = createDiscovery({
      sources: [],
      boards,
      readFixture: readBoardFixture,
      mode: "live",
    });

    const results = await discovery.discoverBoards();

    expect(results.map((r) => r.source)).toEqual(["fallback", "fallback"]);
  });

  it("keeps a board's Run going with no Postings when it has no fixture either", async () => {
    const discovery = createDiscovery({
      sources: [greenhouseJobSource({ fetch: recordedFetch().fetch, timeoutMs: 1000 })],
      boards: [...boards, { ats: "greenhouse", board: "no-such-board" }],
      readFixture: readBoardFixture,
      mode: "live",
    });

    const results = await discovery.discoverBoards();

    expect(results.at(-1)).toMatchObject({ source: "fallback", postings: [] });
    expect(results[0]?.postings.length).toBeGreaterThan(0);
  });

  it("caps the Postings kept per board", async () => {
    const recorded = recordedFetch();
    const discovery = createDiscovery({
      sources: [greenhouseJobSource({ fetch: recorded.fetch, timeoutMs: 1000 })],
      boards,
      readFixture: readBoardFixture,
      mode: "live",
      maxPerBoard: 2,
    });

    expect(await discovery.discover()).toHaveLength(4);
  });

  it("in fixtures mode never fetches and labels every Posting fixture", async () => {
    const { discovery, calls } = discoveryWith({ mode: "fixtures" });

    const postings = await discovery.discover();

    expect(calls).toEqual([]);
    expect(postings.length).toBeGreaterThan(0);
    expect(postings.every((p) => p.source === "fixture")).toBe(true);
  });

  it("only ever sends GET requests", async () => {
    const { discovery, calls } = discoveryWith({ failing: ["stripe"] });

    await discovery.discover();

    expect(calls.length).toBe(2);
    expect(calls.every((c) => c.method === "GET")).toBe(true);
  });
});

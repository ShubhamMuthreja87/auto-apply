/**
 * Adapter seam (spec, Testing seam 3): the Greenhouse adapter driven by an
 * injected `fetch` that returns recorded real board responses.
 */
import { describe, expect, it } from "vitest";
import { postingSchema } from "@auto-apply/shared";
import { BOARDS, DEMO_BOARD, boardsFor } from "./boards.js";
import { greenhouseJobSource } from "./greenhouse.js";
import { readBoardFixture } from "./fixtures.js";
import { recordedFetch } from "./recorded-fetch.js";

describe("Greenhouse adapter", () => {
  it("normalises a recorded board into contract-valid live Postings", async () => {
    const { fetch, calls } = recordedFetch();
    const source = greenhouseJobSource({ fetch, timeoutMs: 1000 });

    const postings = await source.discover("stripe");

    expect(calls).toEqual([
      {
        url: "https://boards-api.greenhouse.io/v1/boards/stripe/jobs?content=true",
        method: "GET",
      },
    ]);
    expect(postings.length).toBeGreaterThan(0);
    for (const posting of postings) {
      expect(postingSchema.parse(posting)).toEqual(posting);
      expect(posting).toMatchObject({ ats: "greenhouse", board: "stripe", company: "Stripe" });
      expect(posting.source).toBe("live");
      expect(posting.descriptionText).not.toMatch(/<[a-z/][^>]*>|&lt;|&amp;/i);
    }
  });

  it("parses the remote flag from the location and keeps the ATS job id", async () => {
    const source = greenhouseJobSource({ fetch: recordedFetch().fetch, timeoutMs: 1000 });

    const postings = await source.discover("stripe");

    const remote = postings.find((p) => p.jobId === "8113337");
    expect(remote).toMatchObject({
      title: "ARG Engineering Manager",
      location: "US - Remote",
      remote: true,
      applyUrl: "https://stripe.com/jobs/search?gh_jid=8113337",
    });
    expect(postings.find((p) => p.location === "Singapore")?.remote).toBe(false);
  });

  it("strips the description HTML to readable text", async () => {
    const source = greenhouseJobSource({ fetch: recordedFetch().fetch, timeoutMs: 1000 });

    const [posting] = await source.discover("anthropic");

    expect(posting?.descriptionText.length).toBeGreaterThan(200);
    expect(posting?.descriptionText).toContain("Anthropic");
  });

  it("throws on an HTTP error so the caller can fall back", async () => {
    const source = greenhouseJobSource({
      fetch: recordedFetch({ failing: ["stripe"] }).fetch,
      timeoutMs: 1000,
    });

    await expect(source.discover("stripe")).rejects.toThrow(/HTTP 503/);
  });

  it("throws on a body that is not a Greenhouse board", async () => {
    const fetch = (async () => Response.json({ unexpected: true })) as typeof globalThis.fetch;
    const source = greenhouseJobSource({ fetch, timeoutMs: 1000 });

    await expect(source.discover("stripe")).rejects.toThrow();
  });

  it("gives up after the timeout", async () => {
    const hanging = ((_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      })) as typeof fetch;
    const source = greenhouseJobSource({ fetch: hanging, timeoutMs: 10 });

    await expect(source.discover("stripe")).rejects.toThrow(/timed out after 10 ms/);
  });
});

describe("board registry and fixtures", () => {
  it("lists ~15 Greenhouse boards, including Stripe and Anthropic", () => {
    expect(BOARDS.length).toBe(15);
    expect(BOARDS.every((b) => b.ats === "greenhouse")).toBe(true);
    expect(BOARDS.map((b) => b.board)).toEqual(expect.arrayContaining(["stripe", "anthropic"]));
  });

  it("keeps the synthetic demo board out of live Runs, and adds it in fixtures mode only", () => {
    expect(BOARDS.some((b) => b.board.startsWith("demo-"))).toBe(false);
    expect(boardsFor("live")).toEqual(BOARDS);
    expect(boardsFor("fixtures")).toEqual([...BOARDS, DEMO_BOARD]);
  });

  it("reads the demo board as one clearly synthetic Posting", async () => {
    const postings = await readBoardFixture(DEMO_BOARD, "fixture");
    expect(postings).toHaveLength(1);
    expect(postings[0]).toMatchObject({
      board: "demo-synthetic",
      company: "Demo Co (synthetic)",
      source: "fixture",
    });
  });

  it.each(BOARDS.map((b) => [b.board, b] as const))(
    "%s has a recorded fallback fixture that parses",
    async (_name, ref) => {
      const postings = await readBoardFixture(ref, "fallback");
      expect(postings.length).toBeGreaterThan(0);
      expect(postings.every((p) => p.source === "fallback" && p.board === ref.board)).toBe(true);
    },
  );
});

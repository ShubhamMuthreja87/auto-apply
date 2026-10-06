/**
 * Recorded real board responses (GET, trimmed to a handful of engineering
 * jobs, field values untouched). They are the adapter-seam test inputs and
 * each board's D3 fallback, and they back the fixtures-only job source.
 */
import { readFile } from "node:fs/promises";
import type { Posting, PostingSource } from "@auto-apply/shared";
import type { BoardRef } from "../pipeline/ports.js";
import { parseGreenhouseBoard } from "./greenhouse.js";

/** `apps/api/fixtures`, from both `src/discovery` and `dist/discovery`. */
const FIXTURES_DIR = new URL("../../fixtures/", import.meta.url);

/** The recorded response for one board, as the raw JSON the ATS returned. */
export async function readBoardRecording(ref: BoardRef): Promise<unknown> {
  if (!/^[a-z0-9-]+$/.test(ref.board)) throw new Error(`Invalid board name: ${ref.board}`);
  const file = new URL(`${ref.ats}/boards/${ref.board}.json`, FIXTURES_DIR);
  return JSON.parse(await readFile(file, "utf8")) as unknown;
}

/**
 * The recorded Greenhouse application form (`?questions=true`) of one job, as
 * the raw JSON Greenhouse returned (GET, untouched): the form adapter's test
 * input and its D3 fallback. Throws when that job's form was not recorded.
 */
export async function readFormRecording(job: { board: string; jobId: string }): Promise<unknown> {
  if (!/^[a-z0-9-]+$/.test(job.board)) throw new Error(`Invalid board name: ${job.board}`);
  if (!/^[0-9]+$/.test(job.jobId)) throw new Error(`Invalid job id: ${job.jobId}`);
  const file = new URL(`greenhouse/forms/${job.board}-${job.jobId}.json`, FIXTURES_DIR);
  return JSON.parse(await readFile(file, "utf8")) as unknown;
}

/** Reads a board's recording as Postings labelled `fallback` or `fixture`. */
export type FixtureReader = (
  ref: BoardRef,
  source: Exclude<PostingSource, "live">,
) => Promise<Posting[]>;

export const readBoardFixture: FixtureReader = async (ref, source) => {
  if (ref.ats !== "greenhouse") throw new Error(`No fixture parser for ${ref.ats}`);
  return parseGreenhouseBoard(ref.board, await readBoardRecording(ref), source);
};

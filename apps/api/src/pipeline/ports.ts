/**
 * The pipeline's outward-facing ports (CLAUDE.md, Flow 6). The pipeline depends
 * only on these and on the `Repo`; adapters and test fakes implement them, and
 * `buildPipeline` receives them. The evaluator and submitter ports join as
 * their tickets land.
 */
import type { Ats, Posting } from "@auto-apply/shared";

/** One public job board on one ATS, e.g. Greenhouse `stripe` (D2). */
export interface BoardRef {
  ats: Ats;
  board: string;
}

/**
 * One ATS's discovery adapter (spec, Discovery & ATS adapters): GET-only reads
 * of a public board, normalised into Postings labelled `live`. Throws when the
 * board cannot be read; the caller decides what to fall back to (D3). Only the
 * Greenhouse adapter exists (2026-10-06 time cut); Lever and Ashby would be
 * further implementations of this port.
 */
export interface JobSource {
  readonly ats: Ats;
  discover(board: string): Promise<Posting[]>;
}

/**
 * What the pipeline asks for: every Posting to consider in this Run, across
 * all boards. Never throws for a single failed board; that board falls back to
 * its recorded fixtures, labelled (D3).
 */
export interface Discovery {
  discover(): Promise<Posting[]>;
}

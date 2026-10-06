/**
 * The pipeline's outward-facing ports (CLAUDE.md, Flow 6). The pipeline depends
 * only on these and on the `Repo`; adapters and test fakes implement them, and
 * `buildPipeline` receives them. Ticket 05 needs only discovery; the evaluator
 * and submitter ports join as their tickets land.
 */
import type { Posting } from "@auto-apply/shared";

/** Finds Postings to consider (D2). Ticket 06 backs it with the ATS boards. */
export interface JobSource {
  discover(): Promise<Posting[]>;
}

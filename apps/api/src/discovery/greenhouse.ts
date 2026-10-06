/**
 * The Greenhouse discovery adapter (D2): reads a public job board with one GET
 * to `boards-api.greenhouse.io` (always `content=true`) and normalises every
 * job into a Posting. Never writes to Greenhouse.
 */
import { z } from "zod";
import type { Posting, PostingSource } from "@auto-apply/shared";
import type { JobSource } from "../pipeline/ports.js";
import { logger } from "../logger.js";
import { htmlToText, isRemote } from "./normalise.js";
import { atsGetJson } from "../ats-get.js";

export const GREENHOUSE_API = "https://boards-api.greenhouse.io/v1/boards";

/** Text Greenhouse may send as a string, `null`, or not at all; anything else is unknown. */
const looseText = z.preprocess((value) => (typeof value === "string" ? value : ""), z.string());

/**
 * Only the fields we use; Greenhouse sends many more. Lenient by design (the
 * null-fallback rule): only an id and a title are required, everything else a
 * job leaves out or sends as `null` becomes empty (unknown), so one partial
 * job never fails its board's parse and pushes the board onto fallback.
 */
const greenhouseJobSchema = z.object({
  id: z.union([z.number().int(), z.string().regex(/^\d+$/)]),
  title: z.string().trim().min(1),
  absolute_url: looseText,
  updated_at: looseText,
  location: z.preprocess(
    (value) => (value !== null && typeof value === "object" ? value : {}),
    z.object({ name: looseText }),
  ),
  company_name: looseText,
  content: looseText,
});

/** The board envelope: a `jobs` array; each job is validated on its own. */
const greenhouseBoardSchema = z.object({ jobs: z.array(z.unknown()) });

export function greenhouseBoardUrl(board: string): string {
  return `${GREENHOUSE_API}/${encodeURIComponent(board)}/jobs?content=true`;
}

/** The public job page, when a job does not give its own valid URL. */
function applyUrlFor(board: string, jobId: string, given: string): string {
  if (z.string().url().safeParse(given).success) return given;
  return `https://boards.greenhouse.io/${encodeURIComponent(board)}/jobs/${jobId}`;
}

/** Sort key for "newest updated first"; an unknown date sorts last. */
function updatedTime(updatedAt: string): number {
  const time = Date.parse(updatedAt);
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

/**
 * Validates a Greenhouse board response (live or recorded) and normalises it,
 * newest-updated first. Throws if the body is not a Greenhouse board; a single
 * job without an id or title is skipped and logged, never fatal.
 */
export function parseGreenhouseBoard(
  board: string,
  body: unknown,
  source: PostingSource,
): Posting[] {
  const { jobs } = greenhouseBoardSchema.parse(body);
  const valid: z.infer<typeof greenhouseJobSchema>[] = [];
  jobs.forEach((raw, index) => {
    const job = greenhouseJobSchema.safeParse(raw);
    if (job.success) valid.push(job.data);
    else logger.warn("greenhouse_job_skipped", { board, index, reason: "no usable id or title" });
  });
  return valid
    .sort((a, b) => updatedTime(b.updated_at) - updatedTime(a.updated_at))
    .map((job) => {
      const jobId = String(job.id);
      const location = job.location.name.trim();
      return {
        ats: "greenhouse",
        board,
        jobId,
        title: job.title,
        company: job.company_name.trim() || board,
        location,
        descriptionText: htmlToText(job.content),
        applyUrl: applyUrlFor(board, jobId, job.absolute_url),
        remote: isRemote(location),
        source,
      };
    });
}

export interface GreenhouseOptions {
  fetch: typeof fetch;
  /** Per-board budget for the whole request, body included. */
  timeoutMs: number;
}

export function greenhouseJobSource({ fetch, timeoutMs }: GreenhouseOptions): JobSource {
  return {
    ats: "greenhouse",
    async discover(board) {
      const what = `Greenhouse board ${board}`;
      const body = await atsGetJson(fetch, greenhouseBoardUrl(board), timeoutMs, what);
      return parseGreenhouseBoard(board, body, "live");
    },
  };
}

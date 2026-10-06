/**
 * The Greenhouse discovery adapter (D2): reads a public job board with one GET
 * to `boards-api.greenhouse.io` (always `content=true`) and normalises every
 * job into a Posting. Never writes to Greenhouse.
 */
import { z } from "zod";
import type { Posting, PostingSource } from "@auto-apply/shared";
import type { JobSource } from "../pipeline/ports.js";
import { htmlToText, isRemote } from "./normalise.js";

export const GREENHOUSE_API = "https://boards-api.greenhouse.io/v1/boards";

/** Only the fields we use; Greenhouse sends many more. */
const greenhouseJobSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  absolute_url: z.string().url(),
  updated_at: z.string(),
  location: z.object({ name: z.string().nullable() }).nullable().optional(),
  company_name: z.string().nullable().optional(),
  content: z.string().nullable().optional(),
});

const greenhouseBoardSchema = z.object({ jobs: z.array(greenhouseJobSchema) });

export function greenhouseBoardUrl(board: string): string {
  return `${GREENHOUSE_API}/${encodeURIComponent(board)}/jobs?content=true`;
}

/**
 * Validates a Greenhouse board response (live or recorded) and normalises it,
 * newest-updated first. Throws if the body is not a Greenhouse board.
 */
export function parseGreenhouseBoard(
  board: string,
  body: unknown,
  source: PostingSource,
): Posting[] {
  const { jobs } = greenhouseBoardSchema.parse(body);
  return [...jobs]
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
    .map((job) => {
      const location = job.location?.name ?? "";
      return {
        ats: "greenhouse",
        board,
        jobId: String(job.id),
        title: job.title.trim(),
        company: job.company_name?.trim() || board,
        location,
        descriptionText: htmlToText(job.content ?? ""),
        applyUrl: job.absolute_url,
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
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(greenhouseBoardUrl(board), {
          method: "GET",
          headers: { accept: "application/json" },
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Greenhouse board ${board} answered HTTP ${res.status}`);
        return parseGreenhouseBoard(board, await res.json(), "live");
      } catch (err) {
        if (controller.signal.aborted) {
          throw new Error(`Greenhouse board ${board} timed out after ${timeoutMs} ms`);
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

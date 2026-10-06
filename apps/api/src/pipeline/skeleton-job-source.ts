/**
 * Placeholder Postings for the ticket-05 skeleton, until ticket 06 brings real
 * ATS discovery. Clearly fake (`example.com`, "Skeleton" company) so nobody
 * mistakes them for real jobs, and never marked Seen.
 */
import type { Posting } from "@auto-apply/shared";
import type { Discovery } from "./ports.js";

const titles = ["Frontend Engineer", "Backend Engineer", "Full-stack Engineer"];

export const skeletonJobSource: Discovery = {
  async discover(): Promise<Posting[]> {
    return titles.map((title, i) => ({
      ats: "greenhouse",
      board: "skeleton",
      jobId: String(i + 1),
      title,
      company: "Skeleton Co (placeholder data)",
      location: "Remote",
      descriptionText: "Placeholder posting used by the pipeline skeleton.",
      applyUrl: `https://example.com/skeleton/${i + 1}`,
      remote: true,
      source: "live" as const,
    }));
  },
};

/**
 * The API's error answers: the contract's one JSON error shape, never a stack
 * trace (CODING_STANDARDS, API), and the Run ownership check every Run-scoped
 * route shares.
 */
import type { Response } from "express";
import { errorResponseSchema, type Repo, type Run } from "@auto-apply/shared";
import { DEMO_UID } from "./user.js";

/** Answers `status` with `{ error: { code, message } }`. */
export function sendError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json(errorResponseSchema.parse({ error: { code, message } }));
}

/**
 * The signed-in user's Run `runId`, or `null` after answering `404
 * run_not_found` when there is no such Run or it belongs to someone else.
 */
export async function ownRunOr404(repo: Repo, res: Response, runId: string): Promise<Run | null> {
  const run = await repo.getRun(runId);
  if (run && run.uid === DEMO_UID) return run;
  sendError(res, 404, "run_not_found", "No such run");
  return null;
}

/**
 * Startup recovery (CODING_STANDARDS landmine: interrupted runs). Runs execute
 * in-process, so a restart (deploy, crash) kills them without a terminal
 * write. Called once at boot, before the API listens, so anything still active
 * is necessarily from before this boot and can never finish: it becomes
 * `failed` with reason `interrupted`, and a reconnecting browser gets that
 * state plus `done` instead of a Run that hangs forever. Its unfinished jobs
 * (`queued`, `evaluating`, `applying`) are failed the same way and counted, so
 * no job row spins forever either; finished jobs keep their outcome.
 *
 * It looks Runs up per user through `getActiveRun`: the Repo holds at most one
 * active Run per user (D17), and the app has a single user (D13, D26), so the
 * port needs no "list every active Run" query for this.
 */
import { RUN_INTERRUPTED_REASON, type EvaluationStatus, type Repo } from "@auto-apply/shared";
import { logger } from "../logger.js";
import { assertEvaluationTransition, assertRunTransition } from "../pipeline/transitions.js";

const UNFINISHED: readonly EvaluationStatus[] = ["queued", "evaluating", "applying"];

/** Fails each user's leftover active Run; resolves to the ids it failed. */
export async function recoverInterruptedRuns(
  repo: Repo,
  uids: readonly string[],
): Promise<string[]> {
  const recovered: string[] = [];
  for (const uid of uids) {
    const run = await repo.getActiveRun(uid);
    if (!run) continue;
    assertRunTransition(run.status, "failed");
    await repo.patchRun(run.runId, { status: "failed", reason: RUN_INTERRUPTED_REASON });
    const jobsFailed = await failUnfinishedJobs(repo, run.runId);
    logger.warn("run_interrupted", { runId: run.runId, uid, wasStatus: run.status, jobsFailed });
    recovered.push(run.runId);
  }
  return recovered;
}

async function failUnfinishedJobs(repo: Repo, runId: string): Promise<number> {
  const unfinished = (await repo.listEvaluations(runId)).filter((e) =>
    UNFINISHED.includes(e.status),
  );
  for (const evaluation of unfinished) {
    assertEvaluationTransition(evaluation.status, "failed");
    await repo.patchEvaluation(runId, evaluation.jobKey, {
      status: "failed",
      reason: RUN_INTERRUPTED_REASON,
    });
  }
  if (unfinished.length > 0) {
    await repo.patchRun(runId, { funnelIncrements: { failed: unfinished.length } });
  }
  return unfinished.length;
}

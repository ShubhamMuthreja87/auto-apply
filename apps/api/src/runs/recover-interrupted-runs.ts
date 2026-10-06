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
 * A Retry (D19) runs after its Run has finished, so a restart can cut one off
 * too, leaving the job `applying` under a terminal Run. Recovery also fails
 * those, in the user's {@link RECOVERY_RUN_WINDOW} most recent Runs, and moves
 * them back into the `failed` count the Retry took them out of.
 *
 * It looks Runs up per user through `getActiveRun` and `listRuns`: the Repo
 * holds at most one active Run per user (D17), and the app has a single user
 * (D13, D26), so the port needs no "list every active Run" query for this.
 */
import {
  isRunActive,
  RUN_INTERRUPTED_REASON,
  type EvaluationStatus,
  type Repo,
} from "@auto-apply/shared";
import { logger } from "../logger.js";
import { assertEvaluationTransition, assertRunTransition } from "../pipeline/transitions.js";

const UNFINISHED: readonly EvaluationStatus[] = ["queued", "evaluating", "applying"];

/** How many of a user's most recent finished Runs are checked for a cut-off Retry. */
export const RECOVERY_RUN_WINDOW = 5;

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
  for (const uid of uids) await failCutOffRetries(repo, uid);
  return recovered;
}

/**
 * Fails every job left `applying` under a recent finished Run: a Retry the
 * restart cut off. The Retry had moved it out of `failed`; this moves it back.
 */
async function failCutOffRetries(repo: Repo, uid: string): Promise<void> {
  const recent = (await repo.listRuns(uid)).slice(0, RECOVERY_RUN_WINDOW);
  for (const run of recent.filter((r) => !isRunActive(r.status))) {
    const cutOff = (await repo.listEvaluations(run.runId)).filter((e) => e.status === "applying");
    for (const evaluation of cutOff) {
      assertEvaluationTransition(evaluation.status, "failed");
      await repo.patchEvaluation(run.runId, evaluation.jobKey, {
        status: "failed",
        reason: RUN_INTERRUPTED_REASON,
      });
      logger.warn("retry_interrupted", { runId: run.runId, jobKey: evaluation.jobKey });
    }
    if (cutOff.length > 0) {
      await repo.patchRun(run.runId, { funnelIncrements: { failed: cutOff.length } });
    }
  }
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

/**
 * The live Run stream (D21): one SSE response per connected browser, fed by the
 * `Repo` subscriptions. Every connect waits for the first `watchRun` callback
 * and the first `watchEvaluations` batch, sends them as one `snapshot`, then
 * forwards later states as `run` / `eval` deltas (full documents, ADR-0003).
 * A terminal Run is followed by `done` and the end of the response. There is no
 * `Last-Event-ID`: a reconnect simply re-snapshots.
 */
import type { Request, Response } from "express";
import {
  doneEventSchema,
  errorEventSchema,
  evalEventSchema,
  isRunActive,
  runEventSchema,
  snapshotEventSchema,
  type Evaluation,
  type EvaluationChange,
  type Repo,
  type Run,
  type SseEventName,
} from "@auto-apply/shared";
import { logger } from "../logger.js";

export interface RunStreamOptions {
  repo: Repo;
  runId: string;
  heartbeatMs: number;
}

export function streamRun(req: Request, res: Response, options: RunStreamOptions): void {
  const { repo, runId, heartbeatMs } = options;
  // The browser may have gone while the route awaited the Run lookup; its
  // `close` has then already fired, so never subscribe (landmine: listener leaks).
  if (req.destroyed || res.destroyed) return;

  res.status(200).set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    // nginx buffers proxied responses by default; this turns it off per
    // response (CODING_STANDARDS landmine: SSE buffering).
    "X-Accel-Buffering": "no",
    Connection: "keep-alive",
  });
  res.flushHeaders();

  let closed = false;
  let snapshotSent = false;
  let ending = false;
  // The latest state sent (or, before the snapshot, gathered) per document.
  let run: Run | undefined;
  let evaluations: Map<string, Evaluation> | undefined;
  const unsubscribers: (() => void)[] = [];

  const send = (event: SseEventName, data: unknown) => {
    if (!closed) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const finish = () => {
    if (closed) return;
    closed = true;
    for (const unsubscribe of unsubscribers) unsubscribe();
    clearInterval(heartbeat);
    res.end();
  };

  const sendEval = (evaluation: Evaluation) => {
    evaluations?.set(evaluation.jobKey, evaluation);
    send("eval", evalEventSchema.parse(evaluation));
  };

  /**
   * The Run is terminal. Its listener and the Evaluations listener are
   * independent, so the last Evaluation writes may not have arrived yet. A
   * fresh subscription's initial batch is a read taken after the terminal
   * write, so it holds every Evaluation's final state: send whatever changed,
   * then `done`, then end.
   */
  const endWithDone = (terminal: Run) => {
    if (ending || closed) return;
    ending = true;
    const unsubscribe = repo.watchEvaluations(
      runId,
      (changes) => {
        unsubscribe();
        for (const { type, evaluation } of changes) {
          const previous = evaluations?.get(evaluation.jobKey);
          if (type !== "removed" && JSON.stringify(previous) !== JSON.stringify(evaluation)) {
            sendEval(evaluation);
          }
        }
        send("done", doneEventSchema.parse({ runId, status: terminal.status }));
        finish();
      },
      onError,
    );
    unsubscribers.push(unsubscribe);
  };

  const trySnapshot = () => {
    if (snapshotSent || !run || !evaluations) return;
    snapshotSent = true;
    send("snapshot", snapshotEventSchema.parse({ run, evaluations: [...evaluations.values()] }));
    if (!isRunActive(run.status)) endWithDone(run);
  };

  const onRun = (latest: Run) => {
    run = latest;
    if (!snapshotSent) return trySnapshot();
    if (ending) return;
    send("run", runEventSchema.parse(latest));
    if (!isRunActive(latest.status)) endWithDone(latest);
  };

  const onEvaluations = (changes: EvaluationChange[]) => {
    if (!snapshotSent) {
      evaluations ??= new Map();
      for (const { type, evaluation } of changes) {
        if (type === "removed") evaluations.delete(evaluation.jobKey);
        else evaluations.set(evaluation.jobKey, evaluation);
      }
      return trySnapshot();
    }
    if (ending) return;
    // Evaluations are never deleted while a Run streams; nothing to show.
    for (const { type, evaluation } of changes) if (type !== "removed") sendEval(evaluation);
  };

  // Never silent (ADR-0003): a subscription failure reaches the browser. Before
  // the snapshot there is nothing to show, so the stream ends and the browser's
  // reconnect starts over; after it, the stream carries on with what it has.
  function onError(error: Error) {
    logger.error("run_stream_subscription_error", { runId, error: error.message });
    send(
      "error",
      errorEventSchema.parse({ error: { code: "subscription_error", message: error.message } }),
    );
    if (!snapshotSent) finish();
  }

  const heartbeat = setInterval(() => {
    if (!closed) res.write(": heartbeat\n\n");
  }, heartbeatMs);

  // The browser went away: release the listeners and the timer.
  req.on("close", finish);

  unsubscribers.push(repo.watchRun(runId, onRun, onError));
  unsubscribers.push(repo.watchEvaluations(runId, onEvaluations, onError));
}

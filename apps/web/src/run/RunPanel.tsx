/**
 * The Auto-apply button and the live Run view (D20). On load it reattaches to
 * the user's active Run, so a refresh mid-Run loses nothing; the button starts
 * a new Run and stays disabled while one is active (the API's 409 backs it up).
 */
import { useEffect, useState } from "react";
import { isRunActive, type RunFunnel, type RunStatus } from "@auto-apply/shared";
import { ApiError, getActiveRun, startRun } from "../api";
import { useRunStream, type Connection } from "./useRunStream";

const statusLabels: Record<RunStatus, string> = {
  discovering: "Discovering",
  evaluating: "Evaluating",
  applying: "Applying",
  completed: "Completed",
  failed: "Failed",
};

const connectionLabels: Record<Connection, string> = {
  connecting: "Connecting…",
  live: "Live",
  reconnecting: "Reconnecting…",
  closed: "Closed",
};

const funnelLabels: [keyof RunFunnel, string][] = [
  ["discovered", "Discovered"],
  ["evaluated", "Evaluated"],
  ["blocked", "Blocked"],
  ["skipped", "Skipped"],
  ["held", "Held (needs you)"],
  ["submitted", "Submitted (simulated)"],
  ["failed", "Failed"],
];

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error";
}

export function RunPanel() {
  const [runId, setRunId] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const stream = useRunStream(runId);

  useEffect(() => {
    let cancelled = false;
    getActiveRun()
      .then((run) => {
        if (!cancelled && run) setRunId(run.runId);
      })
      .catch((err: unknown) => {
        if (!cancelled) setStartError(`Could not load the active run: ${messageOf(err)}`);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onAutoApply() {
    setStarting(true);
    setStartError(null);
    try {
      setRunId(await startRun());
    } catch (err) {
      if (err instanceof ApiError && err.code === "run_active") {
        // Started elsewhere (another tab): follow that Run instead.
        try {
          const active = await getActiveRun();
          if (active) setRunId(active.runId);
          else setStartError("The other run has just finished. Try again.");
        } catch (lookupErr) {
          setStartError(`Could not load the active run: ${messageOf(lookupErr)}`);
        }
      } else {
        setStartError(`Could not start a run: ${messageOf(err)}`);
      }
    } finally {
      setStarting(false);
    }
  }

  const { run } = stream;
  // Waiting for the first snapshot counts as active, so a double click cannot
  // slip in between POST and stream.
  const runActive = run ? isRunActive(run.status) : runId !== null;

  return (
    <section aria-label="Auto-apply">
      <button type="button" onClick={onAutoApply} disabled={checking || starting || runActive}>
        {starting ? "Starting…" : "Auto-apply"}
      </button>
      <p>Submissions are simulated: payloads are built and stored, never sent.</p>

      {startError && <p role="alert">{startError}</p>}
      {stream.error && <p role="alert">Stream error: {stream.error}</p>}

      {runId && (
        <div>
          <p>Connection: {connectionLabels[stream.connection]}</p>
          {!run ? (
            <p role="status">Loading run…</p>
          ) : (
            <>
              <dl>
                <dt>Status</dt>
                <dd>{statusLabels[run.status]}</dd>
                {run.reason && (
                  <>
                    <dt>Reason</dt>
                    <dd>{run.reason}</dd>
                  </>
                )}
                {funnelLabels.map(([key, label]) => (
                  <div key={key}>
                    <dt>{label}</dt>
                    <dd>{run.funnel[key]}</dd>
                  </div>
                ))}
              </dl>
              {stream.evaluations.length === 0 ? (
                <p>No jobs yet.</p>
              ) : (
                <ul>
                  {stream.evaluations.map((evaluation) => (
                    <li key={evaluation.jobKey}>
                      <strong>{evaluation.posting.title}</strong> at {evaluation.posting.company}:{" "}
                      <span>{evaluation.status}</span>
                      {evaluation.reason && <span> ({evaluation.reason})</span>}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * The one place the browser holds a Run's live stream (CODING_STANDARDS, Web).
 * It opens an `EventSource` with credentials, parses every event with the
 * contract's schemas, and closes on `done`, on unmount, or when the run id
 * changes. State is always the latest the server sent (ADR-0003): a `snapshot`
 * replaces everything, so a reconnect re-renders from scratch and loses nothing.
 */
import { useEffect, useState } from "react";
import {
  doneEventSchema,
  errorEventSchema,
  evalEventSchema,
  runEventSchema,
  snapshotEventSchema,
  type Evaluation,
  type Run,
} from "@auto-apply/shared";
import { runEventsUrl } from "../api";

export type Connection = "connecting" | "live" | "reconnecting" | "closed";

export interface RunStreamState {
  connection: Connection;
  run: Run | null;
  /** The latest Evaluation per Job Key, in the order they first appeared. */
  evaluations: Evaluation[];
  error: string | null;
}

const initial: RunStreamState = {
  connection: "connecting",
  run: null,
  evaluations: [],
  error: null,
};

/** Shown when the stream ends without `done`; the view keeps its last state. */
export const LOST_CONNECTION =
  "Lost the live connection to the server. Reload the page to reconnect.";

function upsert(evaluations: Evaluation[], next: Evaluation): Evaluation[] {
  const i = evaluations.findIndex((e) => e.jobKey === next.jobKey);
  if (i === -1) return [...evaluations, next];
  return evaluations.map((e, j) => (j === i ? next : e));
}

export function useRunStream(runId: string | null): RunStreamState {
  const [state, setState] = useState<RunStreamState>(initial);

  useEffect(() => {
    setState(initial);
    if (!runId) return;

    const source = new EventSource(runEventsUrl(runId), { withCredentials: true });

    /** Parses one event's JSON; a malformed one is reported, never trusted. */
    const handle =
      <T>(parse: (data: unknown) => T, apply: (prev: RunStreamState, data: T) => RunStreamState) =>
      (event: Event) => {
        let data: T;
        try {
          data = parse(JSON.parse((event as MessageEvent<string>).data));
        } catch {
          setState((prev) => ({ ...prev, error: `Malformed ${event.type} event from the server` }));
          return;
        }
        setState((prev) => apply(prev, data));
      };

    source.addEventListener(
      "snapshot",
      handle(snapshotEventSchema.parse, (_prev, { run, evaluations }) => ({
        connection: "live",
        run,
        evaluations,
        error: null,
      })),
    );
    source.addEventListener(
      "run",
      handle(runEventSchema.parse, (prev, run) => ({ ...prev, run })),
    );
    source.addEventListener(
      "eval",
      handle(evalEventSchema.parse, (prev, evaluation) => ({
        ...prev,
        evaluations: upsert(prev.evaluations, evaluation),
      })),
    );
    const onDone = handle(doneEventSchema.parse, (prev) => ({
      ...prev,
      connection: "closed" as const,
    }));
    source.addEventListener("done", (event) => {
      // The server ends the response next; without close() the browser would
      // reconnect and stream the finished Run again.
      source.close();
      onDone(event);
    });
    // `error` is both the server's named event (it carries data) and the
    // browser's own connection-error signal (it does not).
    source.addEventListener("error", (event) => {
      if (event instanceof MessageEvent) {
        handle(errorEventSchema.parse, (prev, { error }) => ({ ...prev, error: error.message }))(
          event,
        );
        return;
      }
      // CLOSED means the browser gave up (e.g. the server answered non-200)
      // and will not retry: say so rather than leave a stale view looking live.
      setState((prev) =>
        source.readyState === EventSource.CLOSED
          ? { ...prev, connection: "closed", error: LOST_CONNECTION }
          : { ...prev, connection: "reconnecting" },
      );
    });

    return () => source.close();
  }, [runId]);

  return state;
}

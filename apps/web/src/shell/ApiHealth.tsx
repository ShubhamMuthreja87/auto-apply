/**
 * A quiet line in the footer saying which API, namespace and store the page is
 * talking to, so an in-memory store is never mistaken for persistence (ADR-0004).
 */
import { useEffect, useState } from "react";
import Typography from "@mui/material/Typography";
import { healthResponseSchema, type HealthResponse } from "@auto-apply/shared";
import { messageOf } from "../api";

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; health: HealthResponse };

export function ApiHealth() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/health`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`API responded ${res.status}`);
        }
        return healthResponseSchema.parse(await res.json());
      })
      .then((health) => {
        if (!cancelled) {
          setState({ kind: "ready", health });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({ kind: "error", message: messageOf(err) });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === "loading") {
    return (
      <Typography variant="caption" color="text.secondary">
        Checking API…
      </Typography>
    );
  }
  if (state.kind === "error") {
    return (
      <Typography variant="caption" color="error" role="alert">
        Could not reach the API: {state.message}
      </Typography>
    );
  }
  const { health } = state;
  return (
    <Typography variant="caption" color="text.secondary">
      API {health.status} · namespace {health.namespace} ·{" "}
      {health.repo === "memory" ? "In-memory (not persisted)" : "Firestore"}
    </Typography>
  );
}

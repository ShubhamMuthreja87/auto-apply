import { useEffect, useState } from "react";
import { healthResponseSchema, type HealthResponse } from "@auto-apply/shared";

// In dev the web app (5173) calls the API (3001) cross-origin; in production the
// same origin serves both and nginx proxies /api, so the default is a bare path.
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; health: HealthResponse };

export function App() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;

    fetch(`${API_URL}/api/health`)
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
          setState({
            kind: "error",
            message: err instanceof Error ? err.message : "Unknown error",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main>
      <h1>AI Auto-Apply</h1>
      {state.kind === "loading" && <p role="status">Checking API…</p>}
      {state.kind === "error" && <p role="alert">Could not reach the API: {state.message}</p>}
      {state.kind === "ready" && (
        <dl>
          <dt>API status</dt>
          <dd>{state.health.status}</dd>
          <dt>Service</dt>
          <dd>{state.health.service}</dd>
          <dt>Namespace</dt>
          <dd>{state.health.namespace}</dd>
          <dt>Storage</dt>
          <dd>
            {state.health.repo === "memory" ? "In-memory (not persisted)" : "Firestore"}
          </dd>
        </dl>
      )}
    </main>
  );
}

/**
 * The browser's calls to the API, each response parsed with the shared
 * contract. Credentials ride every call so the auth cookie (ticket 15) works
 * cross-origin in dev.
 */
import {
  activeRunResponseSchema,
  createRunResponseSchema,
  errorResponseSchema,
  evaluationsListResponseSchema,
  meResponseSchema,
  retrySubmitResponseSchema,
  runsListResponseSchema,
  type Evaluation,
  type MeResponse,
  type Run,
} from "@auto-apply/shared";

// In dev the web app (5173) calls the API (3001) cross-origin; in production the
// same origin serves both and nginx proxies /api, so VITE_API_URL is "".
export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

/** A non-2xx answer, carrying the contract's error code when there is one. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function readJson(res: Response): Promise<unknown> {
  if (res.ok) return res.json();
  const body = errorResponseSchema.safeParse(await res.json().catch(() => null));
  throw new ApiError(
    res.status,
    body.success ? body.data.error.code : null,
    body.success ? body.data.error.message : `API responded ${res.status}`,
  );
}

/** `POST /api/runs`: starts a Run; an `ApiError` with code `run_active` on 409. */
export async function startRun(): Promise<string> {
  const res = await fetch(`${API_URL}/api/runs`, { method: "POST", credentials: "include" });
  return createRunResponseSchema.parse(await readJson(res)).runId;
}

/** `GET /api/runs/active`: the Run to reattach to after a refresh, if any. */
export async function getActiveRun(): Promise<Run | null> {
  const res = await fetch(`${API_URL}/api/runs/active`, { credentials: "include" });
  return activeRunResponseSchema.parse(await readJson(res)).run;
}

/** `GET /api/runs`: the user's Runs, newest first. */
export async function listRuns(): Promise<Run[]> {
  const res = await fetch(`${API_URL}/api/runs`, { credentials: "include" });
  return runsListResponseSchema.parse(await readJson(res)).runs;
}

/** `GET /api/evaluations`: one Run's stored Evaluations, or every Run's when `runId` is null. */
export async function listEvaluations(runId: string | null): Promise<Evaluation[]> {
  const query = runId === null ? "" : `?runId=${encodeURIComponent(runId)}`;
  const res = await fetch(`${API_URL}/api/evaluations${query}`, { credentials: "include" });
  return evaluationsListResponseSchema.parse(await readJson(res)).evaluations;
}

/**
 * `POST /api/runs/:runId/jobs/:jobKey/retry`: Retry of a simulated failure
 * (D19); resolves with the Evaluation, now submitted (simulated). An
 * `ApiError` with code `not_retryable` (409) for anything else.
 */
export async function retrySubmit(runId: string, jobKey: string): Promise<Evaluation> {
  const res = await fetch(
    `${API_URL}/api/runs/${encodeURIComponent(runId)}/jobs/${encodeURIComponent(jobKey)}/retry`,
    { method: "POST", credentials: "include" },
  );
  return retrySubmitResponseSchema.parse(await readJson(res)).evaluation;
}

/** `GET /api/me`: the user document (profile, preferences, settings). */
export async function getMe(): Promise<MeResponse> {
  const res = await fetch(`${API_URL}/api/me`, { credentials: "include" });
  return meResponseSchema.parse(await readJson(res));
}

/** A caught error's message, for showing to the user. */
export function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error";
}

export function runEventsUrl(runId: string): string {
  return `${API_URL}/api/runs/${encodeURIComponent(runId)}/events`;
}

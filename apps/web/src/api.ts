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
  loginRequestSchema,
  meResponseSchema,
  retrySubmitResponseSchema,
  runsListResponseSchema,
  sessionResponseSchema,
  type Evaluation,
  type LoginRequest,
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

type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

/**
 * Registers what happens when any API call answers `401` (the session is
 * missing or expired): the auth provider sends the user to the login page.
 * Returns the unregister function.
 */
export function onUnauthorized(handler: UnauthorizedHandler): () => void {
  unauthorizedHandler = handler;
  return () => {
    if (unauthorizedHandler === handler) unauthorizedHandler = null;
  };
}

/** Every call carries the session cookie; a `401` signs the browser out. */
async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${API_URL}${path}`, { ...init, credentials: "include" });
  if (res.status === 401) unauthorizedHandler?.();
  return res;
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
  const res = await apiFetch(`/api/runs`, { method: "POST" });
  return createRunResponseSchema.parse(await readJson(res)).runId;
}

/** `GET /api/runs/active`: the Run to reattach to after a refresh, if any. */
export async function getActiveRun(): Promise<Run | null> {
  const res = await apiFetch(`/api/runs/active`);
  return activeRunResponseSchema.parse(await readJson(res)).run;
}

/** `GET /api/runs`: the user's Runs, newest first. */
export async function listRuns(): Promise<Run[]> {
  const res = await apiFetch(`/api/runs`);
  return runsListResponseSchema.parse(await readJson(res)).runs;
}

/** `GET /api/evaluations`: one Run's stored Evaluations, or every Run's when `runId` is null. */
export async function listEvaluations(runId: string | null): Promise<Evaluation[]> {
  const query = runId === null ? "" : `?runId=${encodeURIComponent(runId)}`;
  const res = await apiFetch(`/api/evaluations${query}`);
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
  const res = await apiFetch(`/api/me`);
  return meResponseSchema.parse(await readJson(res));
}

/**
 * `GET /api/session`: whether the session cookie is valid. `false` on `401`;
 * any other failure throws, so "API down" is not mistaken for "signed out".
 */
export async function getSession(): Promise<boolean> {
  const res = await fetch(`${API_URL}/api/session`, { credentials: "include" });
  if (res.status === 401) return false;
  sessionResponseSchema.parse(await readJson(res));
  return true;
}

/**
 * `POST /api/login`: sets the session cookie. An `ApiError` with code
 * `invalid_credentials` (401) or `rate_limited` (429) on failure. A wrong
 * password is not a lost session, so it does not trigger the 401 handler.
 */
export async function login(credentials: LoginRequest): Promise<void> {
  const res = await fetch(`${API_URL}/api/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(loginRequestSchema.parse(credentials)),
  });
  sessionResponseSchema.parse(await readJson(res));
}

/** `POST /api/logout`: clears the session cookie. */
export async function logout(): Promise<void> {
  const res = await fetch(`${API_URL}/api/logout`, { method: "POST", credentials: "include" });
  if (!res.ok) await readJson(res);
}

/** A caught error's message, for showing to the user. */
export function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error";
}

export function runEventsUrl(runId: string): string {
  return `${API_URL}/api/runs/${encodeURIComponent(runId)}/events`;
}

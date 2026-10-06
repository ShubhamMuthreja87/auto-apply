/**
 * The one way the API reads an ATS (D2): a GET with a time budget for the
 * whole request, body included, answered as parsed JSON. GET only: nothing
 * here can write to an ATS or employer endpoint.
 *
 * Throws `"<what> answered HTTP <status>"` on a non-2xx answer and `"<what>
 * timed out after <ms> ms"` when the budget runs out, so callers can fall back
 * with a readable reason (D3).
 */
export async function atsGetJson(
  fetchFn: typeof fetch,
  url: string,
  timeoutMs: number,
  what: string,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`${what} answered HTTP ${res.status}`);
    return (await res.json()) as unknown;
  } catch (err) {
    if (controller.signal.aborted) throw new Error(`${what} timed out after ${timeoutMs} ms`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

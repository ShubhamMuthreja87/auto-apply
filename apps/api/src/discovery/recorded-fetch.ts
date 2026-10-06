/**
 * Test support: a `fetch` that answers Greenhouse board and form URLs with the recorded
 * real responses in `apps/api/fixtures`, so tests never touch the network.
 * Boards listed in `failing` answer HTTP 503 instead. Every request is kept in
 * `calls`, so a test can assert that only GETs were sent.
 */
import { GREENHOUSE_API } from "./greenhouse.js";
import { readBoardRecording, readFormRecording } from "./fixtures.js";

export interface RecordedFetch {
  fetch: typeof fetch;
  calls: { url: string; method: string }[];
}

export function recordedFetch({ failing = [] }: { failing?: string[] } = {}): RecordedFetch {
  const calls: RecordedFetch["calls"] = [];
  const fake = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? "GET" });
    const form = new RegExp(`^${GREENHOUSE_API}/([a-z0-9-]+)/jobs/([0-9]+)\\?questions=true$`).exec(
      url,
    );
    if (form?.[1] && form[2]) {
      if (failing.includes(form[1])) return new Response("unavailable", { status: 503 });
      try {
        const body = await readFormRecording({ board: form[1], jobId: form[2] });
        return Response.json(body);
      } catch {
        return new Response("not recorded", { status: 404 });
      }
    }
    const match = new RegExp(`^${GREENHOUSE_API}/([a-z0-9-]+)/jobs\\?content=true$`).exec(url);
    const board = match?.[1];
    if (!board) return new Response("not recorded", { status: 404 });
    if (failing.includes(board)) return new Response("unavailable", { status: 503 });
    try {
      const body = await readBoardRecording({ ats: "greenhouse", board });
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    } catch {
      return new Response("not recorded", { status: 404 });
    }
  };
  return { fetch: fake as typeof fetch, calls };
}

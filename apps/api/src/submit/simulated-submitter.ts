/**
 * The simulated submitter (D18): builds the real Greenhouse application
 * payload — the Job Board API's form fields, keyed by the form's own field
 * ids — waits as long as a send might take, and returns it to be stored.
 *
 * It sends nothing. There is no `fetch` here on purpose: no POST, or any
 * write, ever goes to an ATS or employer endpoint. `endpoint` only records
 * where a real submit would go, and `sent` is always `false`.
 */
import type { PayloadValue, SimulatedSubmission, SubmittedAnswer } from "@auto-apply/shared";
import { GREENHOUSE_API } from "../discovery/greenhouse.js";
import type { ApplicationSubmitter } from "../pipeline/ports.js";

export interface SimulatedSubmitterDeps {
  clock: () => Date;
  /** Stands in for the time a real send takes, so the live view shows `applying`; instant in tests. */
  delay: (ms: number) => Promise<void>;
}

/** How long a simulated send takes. */
export const SIMULATED_SEND_MS = 1_200;

/** Where Greenhouse's Job Board API takes an application for a job; never called (D18). */
export function greenhouseApplicationEndpoint(board: string, jobId: string): string {
  return `${GREENHOUSE_API}/${encodeURIComponent(board)}/jobs/${encodeURIComponent(jobId)}`;
}

function fileName(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").at(-1) ?? "") || "file";
  } catch {
    return "file";
  }
}

/**
 * The payload entries for one answer. Text goes in as written; a select sends
 * its option's value, a multi-select (whose Greenhouse id already ends in
 * `[]`) the list of values; a file answered with a URL uses Greenhouse's
 * `<field>_url` and `<field>_url_filename` keys.
 */
function entriesOf(answer: SubmittedAnswer): Array<[string, PayloadValue]> {
  const { id, type, value } = answer;
  if (typeof value !== "string") {
    const values = value.map((option) => option.value);
    if (type === "multiselect") return [[id, values]];
    const first = values[0];
    return first === undefined ? [] : [[id, first]];
  }
  if (type === "file") {
    return [
      [`${id}_url`, value],
      [`${id}_url_filename`, fileName(value)],
    ];
  }
  return [[id, value]];
}

export function buildGreenhousePayload(
  answers: readonly SubmittedAnswer[],
): Record<string, PayloadValue> {
  return Object.fromEntries(answers.flatMap(entriesOf));
}

export function simulatedSubmitter({ clock, delay }: SimulatedSubmitterDeps): ApplicationSubmitter {
  return {
    async submit(application, { simulateFailure }) {
      const { posting } = application;
      const submission: SimulatedSubmission = {
        ats: posting.ats,
        endpoint: greenhouseApplicationEndpoint(posting.board, posting.jobId),
        method: "POST",
        sent: false,
        formUrl: application.formUrl,
        payload: buildGreenhousePayload(application.answers),
        answers: application.answers,
        attempt: application.attempt,
        builtAt: clock().toISOString(),
      };
      await delay(SIMULATED_SEND_MS);
      return { outcome: simulateFailure ? "failed" : "submitted", submission };
    },
  };
}

import { afterEach, describe, expect, it, vi } from "vitest";
import type { Posting, SubmittedAnswer } from "@auto-apply/shared";
import type { Application } from "../pipeline/ports.js";
import { simulatedSubmitter } from "./simulated-submitter.js";

const posting: Posting = {
  ats: "greenhouse",
  board: "acme",
  jobId: "42",
  title: "Engineering Manager",
  company: "Acme",
  location: "Bengaluru, India",
  descriptionText: "",
  applyUrl: "https://boards.greenhouse.io/acme/jobs/42",
  remote: false,
  source: "fixture",
};

const answers: SubmittedAnswer[] = [
  { id: "first_name", label: "First Name", type: "text", source: "profile", value: "Ada" },
  { id: "email", label: "Email", type: "text", source: "profile", value: "ada@example.com" },
  {
    id: "question_7",
    label: "Will you require sponsorship?",
    type: "select",
    source: "settings",
    value: [{ label: "No", value: 0 }],
  },
  {
    id: "question_8[]",
    label: "Countries you plan to work in",
    type: "multiselect",
    source: "settings",
    value: [
      { label: "India", value: 101 },
      { label: "Singapore", value: 102 },
    ],
  },
  {
    id: "resume",
    label: "Resume/CV",
    type: "file",
    source: "settings",
    value: "https://files.example.com/ada-resume.pdf",
  },
  { id: "question_9", label: "Why us?", type: "textarea", source: "ai", value: "I ship." },
];

const application: Application = {
  posting,
  formUrl: "https://job-boards.greenhouse.io/acme/jobs/42",
  answers,
  attempt: 1,
};

function harness() {
  const waits: number[] = [];
  const submitter = simulatedSubmitter({
    clock: () => new Date("2026-10-06T12:00:00.000Z"),
    delay: async (ms) => {
      waits.push(ms);
    },
  });
  return { submitter, waits };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("simulated submitter (D18)", () => {
  it("builds the Greenhouse payload keyed by the form's real field ids", async () => {
    const { submitter } = harness();

    const { submission } = await submitter.submit(application, { simulateFailure: false });

    expect(submission.payload).toEqual({
      first_name: "Ada",
      email: "ada@example.com",
      question_7: 0,
      "question_8[]": [101, 102],
      resume_url: "https://files.example.com/ada-resume.pdf",
      resume_url_filename: "ada-resume.pdf",
      question_9: "I ship.",
    });
    expect(submission.answers).toEqual(answers);
  });

  it("names where a real submit would go, but records it as never sent", async () => {
    const { submitter } = harness();

    const { outcome, submission } = await submitter.submit(application, {
      simulateFailure: false,
    });

    expect(outcome).toBe("submitted");
    expect(submission).toMatchObject({
      ats: "greenhouse",
      endpoint: "https://boards-api.greenhouse.io/v1/boards/acme/jobs/42",
      method: "POST",
      sent: false,
      formUrl: "https://job-boards.greenhouse.io/acme/jobs/42",
      attempt: 1,
      builtAt: "2026-10-06T12:00:00.000Z",
    });
  });

  it("waits with the injected delay and never touches the network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { submitter, waits } = harness();

    await submitter.submit(application, { simulateFailure: false });

    expect(waits.length).toBeGreaterThan(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fails on purpose when asked, still building the payload to inspect (D19)", async () => {
    const { submitter } = harness();

    const result = await submitter.submit(
      { ...application, attempt: 2 },
      { simulateFailure: true },
    );

    expect(result.outcome).toBe("failed");
    expect(result.submission.attempt).toBe(2);
    expect(result.submission.payload.first_name).toBe("Ada");
  });
});

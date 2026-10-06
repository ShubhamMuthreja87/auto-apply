/**
 * The Greenhouse application form (D5): one GET to the job's `?questions=true`
 * endpoint, validated with zod, and every question group — `questions`,
 * `location_questions`, `education`, `compliance` and `demographic_questions`
 * — merged into one list of normalised fields. Never writes to Greenhouse.
 *
 * A failed or timed-out GET falls back to the job's recorded form, labelled
 * `fallback` (D3); in `fixtures` mode only recordings are read.
 */
import { z } from "zod";
import { GREENHOUSE_API } from "../discovery/greenhouse.js";
import { readFormRecording } from "../discovery/fixtures.js";
import { decodeEntities, htmlToText } from "../discovery/normalise.js";
import { logger } from "../logger.js";
import type {
  FormField,
  FormFieldGroup,
  FormFieldType,
  FormSchema,
  GreenhouseForms,
} from "../pipeline/ports.js";

export function greenhouseFormUrl(board: string, jobId: string): string {
  return `${GREENHOUSE_API}/${encodeURIComponent(board)}/jobs/${encodeURIComponent(jobId)}?questions=true`;
}

const optionSchema = z.object({ label: z.string(), value: z.union([z.string(), z.number()]) });

const questionSchema = z.object({
  label: z.string(),
  required: z.boolean().nullable().optional(),
  description: z.string().nullable().optional(),
  fields: z.array(
    z.object({
      name: z.string(),
      type: z.string(),
      values: z.array(optionSchema).nullable().optional(),
    }),
  ),
});
type GreenhouseQuestion = z.infer<typeof questionSchema>;

const formSchema = z.object({
  id: z.number().int(),
  absolute_url: z.string().url(),
  questions: z.array(questionSchema).nullable().optional(),
  location_questions: z.array(questionSchema).nullable().optional(),
  /** `education_required`, `education_optional`, or absent when not asked. */
  education: z.string().nullable().optional(),
  compliance: z
    .array(z.object({ type: z.string(), questions: z.array(questionSchema).nullable().optional() }))
    .nullable()
    .optional(),
  demographic_questions: z
    .object({
      questions: z
        .array(
          z.object({
            id: z.number().int(),
            label: z.string(),
            required: z.boolean().nullable().optional(),
            type: z.string().optional(),
            answer_options: z
              .array(z.object({ id: z.number().int(), label: z.string() }))
              .nullable()
              .optional(),
          }),
        )
        .nullable()
        .optional(),
    })
    .nullable()
    .optional(),
});

const FIELD_TYPES: Record<string, FormFieldType> = {
  input_text: "text",
  textarea: "textarea",
  input_file: "file",
  multi_value_single_select: "select",
  multi_value_multi_select: "multiselect",
  input_checkbox: "boolean",
  boolean: "boolean",
};

function fieldType(raw: string, hasOptions: boolean): FormFieldType {
  return FIELD_TYPES[raw] ?? (hasOptions ? "select" : "text");
}

function plain(html: string | null | undefined): string {
  // Compliance descriptions arrive entity-escaped twice (`&lt;p&gt;`).
  return html ? htmlToText(decodeEntities(html)) : "";
}

/**
 * One field per question: its first input. A question's later inputs are
 * alternatives (Resume/CV as a file *or* `resume_text`), not extra answers.
 * Hidden inputs (`latitude`, `longitude`) are set by the hosted form's
 * location picker, never by the applicant, so they are not fields to resolve.
 */
function fromQuestion(question: GreenhouseQuestion, group: FormFieldGroup): FormField | null {
  const input = question.fields[0];
  if (!input || input.type === "input_hidden") return null;
  const options = input.values ?? [];
  return {
    id: input.name,
    label: question.label.trim(),
    description: plain(question.description),
    type: fieldType(input.type, options.length > 0),
    required: question.required === true,
    ...(options.length > 0 ? { options } : {}),
    group,
  };
}

/**
 * Greenhouse's education section is a flag, not a list of questions: when
 * set, the hosted form asks for school, degree and discipline (D5: Stripe's
 * required School and Degree live here, outside `questions`).
 */
function educationFields(flag: string | null | undefined): FormField[] {
  if (flag !== "education_required" && flag !== "education_optional") return [];
  const required = flag === "education_required";
  const field = (id: string, label: string, isRequired: boolean): FormField => ({
    id: `education.${id}`,
    label,
    description: "",
    type: "text",
    required: isRequired,
    group: "education",
  });
  return [
    field("school", "School", required),
    field("degree", "Degree", required),
    field("discipline", "Discipline", false),
  ];
}

/** The embed URL serves the form on Greenhouse even when the hosted URL redirects away (D5). */
function formUrlFor(absoluteUrl: string, board: string, jobId: string): string {
  const host = new URL(absoluteUrl).hostname;
  if (host === "greenhouse.io" || host.endsWith(".greenhouse.io")) return absoluteUrl;
  return `https://boards.greenhouse.io/embed/job_app?for=${encodeURIComponent(board)}&token=${encodeURIComponent(jobId)}`;
}

/** Validates a Greenhouse form response (live or recorded) and merges its groups. */
export function parseGreenhouseForm(
  job: { board: string; jobId: string },
  body: unknown,
  source: FormSchema["source"],
): FormSchema {
  const form = formSchema.parse(body);
  const fromGroup = (questions: GreenhouseQuestion[] | null | undefined, group: FormFieldGroup) =>
    (questions ?? []).flatMap((q) => fromQuestion(q, group) ?? []);
  const demographic: FormField[] = (form.demographic_questions?.questions ?? []).map((q) => {
    const options = (q.answer_options ?? []).map((o) => ({ label: o.label, value: o.id }));
    return {
      id: `demographic.${q.id}`,
      label: q.label.trim(),
      description: "",
      type: q.type === "multi_value_multi_select" ? "multiselect" : "select",
      required: q.required === true,
      ...(options.length > 0 ? { options } : {}),
      group: "demographic",
    };
  });
  return {
    formUrl: formUrlFor(form.absolute_url, job.board, job.jobId),
    fields: [
      ...fromGroup(form.questions, "questions"),
      ...fromGroup(form.location_questions, "location"),
      ...educationFields(form.education),
      ...(form.compliance ?? []).flatMap((c) => fromGroup(c.questions, "compliance")),
      ...demographic,
    ],
    source,
  };
}

export interface GreenhouseFormsOptions {
  fetch: typeof fetch;
  timeoutMs: number;
  /** `fixtures` reads only the recorded forms, never the network. */
  mode: "live" | "fixtures";
  /** The recorded form of a job; defaults to `apps/api/fixtures/greenhouse/forms`. */
  readRecording?: (job: { board: string; jobId: string }) => Promise<unknown>;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function greenhouseForms(options: GreenhouseFormsOptions): GreenhouseForms {
  const { fetch, timeoutMs, mode, readRecording = readFormRecording } = options;

  async function fetchLive(job: { board: string; jobId: string }): Promise<FormSchema> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(greenhouseFormUrl(job.board, job.jobId), {
        method: "GET",
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return parseGreenhouseForm(job, await res.json(), "live");
    } catch (err) {
      if (controller.signal.aborted) throw new Error(`timed out after ${timeoutMs} ms`);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async function fromRecording(
    job: { board: string; jobId: string },
    source: "fallback" | "fixture",
    liveError?: string,
  ): Promise<FormSchema> {
    try {
      return parseGreenhouseForm(job, await readRecording(job), source);
    } catch (err) {
      const why = liveError ? `${liveError}; no recorded form` : messageOf(err);
      throw new Error(`Application form for ${job.board}/${job.jobId} unavailable: ${why}`);
    }
  }

  return {
    async fetchSchema(job) {
      if (mode === "fixtures") return fromRecording(job, "fixture");
      try {
        return await fetchLive(job);
      } catch (err) {
        const reason = messageOf(err);
        logger.warn("form_fallback", { ...job, reason });
        return fromRecording(job, "fallback", reason);
      }
    },
  };
}

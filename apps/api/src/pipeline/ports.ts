/**
 * The pipeline's outward-facing ports (CLAUDE.md, Flow 6). The pipeline depends
 * only on these and on the `Repo`; adapters and test fakes implement them, and
 * `buildPipeline` receives them.
 */
import type {
  Ats,
  FitCriterion,
  Posting,
  PostingSource,
  ScoredBy,
  SimulatedSubmission,
  SubmittedAnswer,
} from "@auto-apply/shared";

/** One public job board on one ATS, e.g. Greenhouse `stripe` (D2). */
export interface BoardRef {
  ats: Ats;
  board: string;
}

/**
 * One ATS's discovery adapter (spec, Discovery & ATS adapters): GET-only reads
 * of a public board, normalised into Postings labelled `live`. Throws when the
 * board cannot be read; the caller decides what to fall back to (D3). Only the
 * Greenhouse adapter exists (2026-10-06 time cut); Lever and Ashby would be
 * further implementations of this port.
 */
export interface JobSource {
  readonly ats: Ats;
  discover(board: string): Promise<Posting[]>;
}

/**
 * What the pipeline asks for: every Posting to consider in this Run, across
 * all boards, each board's Postings together and newest first (the pipeline
 * takes the newest unseen ones per board). Never throws for a single failed
 * board; that board falls back to its recorded fixtures, labelled (D3).
 */
export interface Discovery {
  discover(): Promise<Posting[]>;
}

/** One soft criterion judged against a Posting: met or not, with a quote as evidence (D7). */
export interface CriterionJudgement {
  criterionId: string;
  met: boolean;
  /** A quote from the Posting supporting the judgement. */
  evidence: string;
}

/** A `JobEvaluator`'s answer: its judgements, and who made them (D24). */
export interface EvaluatorResult {
  /** `fallback` when the keyword matcher judged instead of the AI. */
  scoredBy: ScoredBy;
  judgements: CriterionJudgement[];
}

/**
 * Judges a Posting that passed screening against the rubric's AI-side criteria
 * (D7): per-criterion evidence only — no score, no Verdict; code computes
 * those (`evaluation/score.ts`). Judgements for criteria it was not asked
 * about are ignored, and a criterion it leaves out counts as not met. Every
 * call counts against the Run's AI-evaluation cap (D17), so the pipeline calls
 * it at most once per Posting per Run. The keyword fallback matcher (ticket
 * 08) and the AI client (ticket 09) implement it.
 */
export interface JobEvaluator {
  evaluate(posting: Posting, criteria: readonly FitCriterion[]): Promise<EvaluatorResult>;
}

/* -------------------------------------------------------------------------- *
 * Application forms (D5, D9–D12, ticket 10).
 * -------------------------------------------------------------------------- */

/** The normalised field types of an application form (spec, Greenhouse form merge). */
export type FormFieldType = "text" | "textarea" | "select" | "multiselect" | "file" | "boolean";

/** One choice of a select field; `value` is what the ATS expects back in the payload. */
export interface FormOption {
  label: string;
  value: string | number;
}

/**
 * Where a field came from in the ATS's form data. `compliance` and
 * `demographic` are the API's own EEOC/demographic groups: never auto-answered
 * (D10).
 */
export type FormFieldGroup = "questions" | "location" | "education" | "compliance" | "demographic";

/** One field of a merged application form (spec: `Field`). */
export interface FormField {
  /** The ATS's own field name, used as the payload key (D18), e.g. `question_68474653`. */
  id: string;
  label: string;
  /** The question's help text, as plain text; may be empty. */
  description: string;
  type: FormFieldType;
  required: boolean;
  /** Choices of a select or multiselect field. */
  options?: FormOption[];
  group: FormFieldGroup;
}

/** A Posting's application form with every question group merged into one list (D5). */
export interface FormSchema {
  /**
   * Where a person opens the form: the hosted Greenhouse URL, or the embed
   * URL when the hosted one leaves Greenhouse (Stripe's redirects to
   * stripe.com, D5).
   */
  formUrl: string;
  fields: FormField[];
  /** `live`, or the recorded form: `fallback` after a failed GET, `fixture` by choice (D3). */
  source: PostingSource;
}

/**
 * Reads a Greenhouse job's application form (`?questions=true`), GET only,
 * falling back to its recorded form (D3, D5). A capability of its own, not a
 * `JobSource` method: only Greenhouse exposes its form as data (D4). Throws
 * when neither the live form nor a recording can be read.
 */
export interface GreenhouseForms {
  fetchSchema(job: { board: string; jobId: string }): Promise<FormSchema>;
}

/** A fact about the candidate an AI answer may draw on; never contact details (D23). */
export interface CandidateFact {
  /** e.g. `experience.0`, `settings.availability`; answers cite these (D12). */
  id: string;
  text: string;
}

/** A free-text question for the model, copied from the employer's form (untrusted). */
export interface FreeTextQuestion {
  fieldId: string;
  label: string;
  description: string;
}

export interface FreeTextRequest {
  /** The job being applied to; its text is untrusted. */
  posting: Posting;
  /** EM framing for manager titles, Staff for IC titles (D12). */
  framing: "EM" | "Staff";
  facts: readonly CandidateFact[];
  questions: readonly FreeTextQuestion[];
}

/** One drafted answer and the facts it rests on (D12). */
export interface FreeTextAnswer {
  fieldId: string;
  answer: string;
  /** Ids of the {@link CandidateFact}s the answer is based on. */
  basedOn: string[];
}

/**
 * Drafts answers to an application form's free-text questions (D9) from the
 * candidate's facts only. It answers what it can ground in those facts and
 * leaves the rest out; the caller also drops any answer that cites no given
 * fact. When the model gives no usable answer it returns `[]` rather than
 * throwing, so those fields fall to the user. The AI adapter is
 * `ai/free-text-answerer.ts`; tests use fakes.
 */
export interface FreeTextAnswerer {
  answer(request: FreeTextRequest): Promise<FreeTextAnswer[]>;
}

/* -------------------------------------------------------------------------- *
 * Simulated submission (D18, D19, ticket 11).
 * -------------------------------------------------------------------------- */

/** What a submit is built from: the Posting, its form, and every answered field. */
export interface Application {
  posting: Posting;
  formUrl: string;
  /** The fields that have an answer, in form order; unanswered optional fields are left out. */
  answers: SubmittedAnswer[];
  /** 1 for the first submit of this Evaluation, 2 after a Retry (D19). */
  attempt: number;
}

/** The result of one simulated submit: the payload to store, and how the "send" went. */
export interface SubmitResult {
  /** `failed` only when asked to fail on purpose (D19). */
  outcome: "submitted" | "failed";
  submission: SimulatedSubmission;
}

/**
 * Builds the real application payload with the ATS's own field ids, takes the
 * time a send would take (injected `delay`), and returns the payload to store.
 * It never sends anything: no POST, or any write, to an ATS or employer
 * endpoint (D18). The pipeline owns the D19 rule and asks for the deliberate
 * failure with `simulateFailure`; the payload is built either way, so a failed
 * attempt can still be inspected.
 */
export interface ApplicationSubmitter {
  submit(application: Application, options: { simulateFailure: boolean }): Promise<SubmitResult>;
}

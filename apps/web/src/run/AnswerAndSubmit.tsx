/**
 * Answer & submit: on a job held as `needs_you` (D11), the user answers the
 * missing fields themselves and the job is submitted (simulated, D18). One
 * input per field, typed by the field's type; every field is required. This is
 * the user answering — legal, consent or demographic questions included, which
 * D10 allows; the system still never answers them on its own.
 */
import { useState, type FormEvent } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormHelperText from "@mui/material/FormHelperText";
import FormLabel from "@mui/material/FormLabel";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import {
  HELD_REASONS,
  type Evaluation,
  type MissingField,
  type UserAnswerValue,
} from "@auto-apply/shared";
import { messageOf, submitAnswers } from "../api";
import { PayloadDialog } from "../pages/AppliedJobsPage";

type Option = MissingField["options"][number];

/** A yes/no field with no options of its own takes Yes / No (1 / 0), as the API does. */
const YES_NO: Option[] = [
  { label: "Yes", value: 1 },
  { label: "No", value: 0 },
];

function choicesOf(field: MissingField): Option[] {
  if (field.options.length > 0) return field.options;
  return field.type === "boolean" ? YES_NO : [];
}

/** What each input holds: text, a chosen option's value as text, or several for a multi-select. */
type Draft = Record<string, string | string[]>;

export const isAnswerable = (e: Evaluation) =>
  e.status === "held" && e.reason === HELD_REASONS.needsYou && e.draft !== null;

function isWebUrl(text: string): boolean {
  try {
    const { protocol } = new URL(text);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

/** The problem with one field's input, or `null` when it is answered. */
function problemOf(field: MissingField, input: string | string[] | undefined): string | null {
  const empty = input === undefined || (Array.isArray(input) ? input : input.trim()).length === 0;
  if (empty) return "Required";
  if (field.type === "file" && typeof input === "string" && !isWebUrl(input.trim())) {
    return "Enter a link (https://…) to the file";
  }
  return null;
}

/** The request's answer for one field: text, or the chosen option values as the form has them. */
function answerOf(field: MissingField, input: string | string[]): UserAnswerValue {
  if (field.type === "text" || field.type === "textarea" || field.type === "file") {
    return typeof input === "string" ? input.trim() : "";
  }
  const values = choicesOf(field)
    .filter((o) => (Array.isArray(input) ? input : [input]).includes(String(o.value)))
    .map((o) => o.value);
  return field.type === "multiselect" ? values : (values[0] ?? "");
}

/**
 * The "Answer and submit" button of a `needs_you` row, its dialog, and the
 * payload dialog that opens once it is submitted. Stays mounted after the row
 * turns submitted, so the payload dialog survives the update.
 */
export function AnswerAndSubmit({
  evaluation,
  onSubmitted,
}: {
  evaluation: Evaluation;
  onSubmitted: (evaluation: Evaluation) => void;
}) {
  const [answering, setAnswering] = useState(false);
  const [submitted, setSubmitted] = useState<Evaluation | null>(null);
  const title = `${evaluation.posting.company} · ${evaluation.posting.title}`;

  return (
    <>
      {isAnswerable(evaluation) && (
        <Button
          size="small"
          variant="contained"
          sx={{ mt: 1, display: "block" }}
          onClick={() => setAnswering(true)}
        >
          Answer and submit
        </Button>
      )}
      {answering && (
        <AnswerDialog
          title={title}
          evaluation={evaluation}
          onClose={() => setAnswering(false)}
          onSubmitted={(done) => {
            setAnswering(false);
            setSubmitted(done);
            onSubmitted(done);
          }}
        />
      )}
      {submitted?.submission && (
        <PayloadDialog
          title={title}
          submission={submitted.submission}
          onClose={() => setSubmitted(null)}
        />
      )}
    </>
  );
}

function AnswerDialog({
  title,
  evaluation,
  onClose,
  onSubmitted,
}: {
  title: string;
  evaluation: Evaluation;
  onClose: () => void;
  onSubmitted: (evaluation: Evaluation) => void;
}) {
  const fields = evaluation.missingFields;
  const [draft, setDraft] = useState<Draft>({});
  const [showProblems, setShowProblems] = useState(false);
  const [state, setState] = useState<
    { kind: "idle" | "pending" } | { kind: "error"; message: string }
  >({ kind: "idle" });

  const problems = new Map(
    fields.flatMap((f) => {
      const problem = problemOf(f, draft[f.id]);
      return problem ? [[f.id, problem] as const] : [];
    }),
  );
  const set = (id: string, value: string | string[]) =>
    setDraft((current) => ({ ...current, [id]: value }));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setShowProblems(true);
    if (problems.size > 0) return;
    setState({ kind: "pending" });
    try {
      const answers = Object.fromEntries(
        fields.map((f) => [f.id, answerOf(f, draft[f.id] ?? "")] as const),
      );
      onSubmitted(await submitAnswers(evaluation.runId, evaluation.jobKey, answers));
    } catch (err) {
      setState({ kind: "error", message: messageOf(err) });
    }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth aria-labelledby="answer-title">
      <form noValidate onSubmit={(event) => void onSubmit(event)}>
        <DialogTitle id="answer-title">Answer and submit · {title}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5}>
            <Alert severity="info" variant="outlined">
              Only you can answer these. The rest of the form is already filled; the submission is
              simulated and never sent.
            </Alert>
            {fields.map((field) => (
              <FieldInput
                key={field.id}
                field={field}
                value={draft[field.id]}
                problem={showProblems ? (problems.get(field.id) ?? null) : null}
                onChange={(value) => set(field.id, value)}
              />
            ))}
            {state.kind === "error" && <Alert severity="error">{state.message}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={state.kind === "pending"}>
            {state.kind === "pending" ? "Submitting…" : "Submit (simulated)"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

function FieldInput({
  field,
  value,
  problem,
  onChange,
}: {
  field: MissingField;
  value: string | string[] | undefined;
  problem: string | null;
  onChange: (value: string | string[]) => void;
}) {
  const id = `answer-${field.id}`;
  const common = {
    id,
    label: field.label,
    required: true,
    fullWidth: true,
    error: problem !== null,
    helperText: problem ?? field.why,
  };

  if (field.type === "boolean") {
    const labelId = `${id}-label`;
    return (
      <FormControl required error={problem !== null}>
        <FormLabel id={labelId}>{field.label}</FormLabel>
        <RadioGroup
          row
          aria-labelledby={labelId}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        >
          {choicesOf(field).map((option) => (
            <FormControlLabel
              key={String(option.value)}
              value={String(option.value)}
              control={<Radio />}
              label={option.label}
            />
          ))}
        </RadioGroup>
        <FormHelperText>{problem ?? field.why}</FormHelperText>
      </FormControl>
    );
  }
  if (field.type === "select" || field.type === "multiselect") {
    const multiple = field.type === "multiselect";
    return (
      <TextField
        {...common}
        select
        value={
          multiple ? (Array.isArray(value) ? value : []) : typeof value === "string" ? value : ""
        }
        onChange={(event) => {
          const target = event.target as unknown as HTMLSelectElement;
          onChange(multiple ? [...target.selectedOptions].map((o) => o.value) : target.value);
        }}
        slotProps={{ select: { native: true, multiple }, inputLabel: { shrink: true } }}
      >
        {!multiple && <option value="">Choose…</option>}
        {choicesOf(field).map((option) => (
          <option key={String(option.value)} value={String(option.value)}>
            {option.label}
          </option>
        ))}
      </TextField>
    );
  }
  return (
    <TextField
      {...common}
      type={field.type === "file" ? "url" : "text"}
      multiline={field.type === "textarea"}
      minRows={field.type === "textarea" ? 3 : undefined}
      placeholder={field.type === "file" ? "https://…" : undefined}
      value={typeof value === "string" ? value : ""}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

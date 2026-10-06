/**
 * How an Evaluation's source, reason and scoring are shown, shared by the live
 * Run table and the Scanned jobs view so both say the same thing.
 */
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import {
  FAILED_REASONS,
  HELD_REASONS,
  MAX_AI_EVALS,
  SKIP_REASONS,
  type Ats,
  type Evaluation,
  type MissingField,
  type Posting,
  type PostingSource,
} from "@auto-apply/shared";

const atsLabels: Record<Ats, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
};

/**
 * Postings not read live from their board are labelled (D3): `fallback` when
 * the board failed and its recorded fixtures stood in, `fixture` when the API
 * runs on recordings by choice.
 */
const sourceLabels: Record<Exclude<PostingSource, "live">, { label: string; title: string }> = {
  fallback: {
    label: "Fallback",
    title: "The live board could not be read; these are its recorded jobs.",
  },
  fixture: { label: "Fixture", title: "Recorded jobs; the API is not reading live boards." },
};

function SourceLabel({ source }: { source: PostingSource }) {
  if (source === "live") return null;
  const { label, title } = sourceLabels[source];
  return (
    <Chip
      label={label}
      title={title}
      size="small"
      color="warning"
      variant="outlined"
      sx={{ ml: 1 }}
    />
  );
}

/** The ATS and board a Posting came from, labelled when it was not read live. */
export function PostingSourceCell({ posting }: { posting: Posting }) {
  return (
    <>
      {atsLabels[posting.ats]}
      <Typography component="span" variant="body2" color="text.secondary">
        {" "}
        · {posting.board}
      </Typography>
      <SourceLabel source={posting.source} />
    </>
  );
}

/** The fixed skip and held reasons in words; every other reason is already written for people. */
const fixedReasonText: Partial<Record<Evaluation["status"], Record<string, string>>> = {
  skipped: {
    [SKIP_REASONS.seen]: "Seen in an earlier run",
    [SKIP_REASONS.limit]: `Run limit reached (${MAX_AI_EVALS} evaluations per run)`,
    [SKIP_REASONS.stretch]: "Stretch or below",
  },
  held: {
    [HELD_REASONS.belowAutoThreshold]: "Good match, below the auto-apply threshold",
    [HELD_REASONS.needsYou]: "Needs your answers",
  },
  failed: {
    [FAILED_REASONS.simulated]: "Simulated failure (demo)",
  },
};

export function reasonText({ status, reason }: Pick<Evaluation, "status" | "reason">): string {
  if (reason === null) return "—";
  return fixedReasonText[status]?.[reason] ?? reason;
}

/** Labels a score the keyword matcher produced instead of the AI (D24). */
export function FallbackLabel({ scoredBy }: Pick<Evaluation, "scoredBy">) {
  if (scoredBy !== "fallback") return null;
  return (
    <Typography
      component="div"
      variant="caption"
      color="text.secondary"
      title="No AI judgement for this job; scored with the keyword matcher."
      sx={{ whiteSpace: "nowrap" }}
    >
      fallback scoring
    </Typography>
  );
}

/** A score rounded for display, or a dash before scoring. */
export function scoreText(score: number | null): string {
  return score === null ? "—" : String(Math.round(score));
}

/**
 * The required form fields only the user can answer, under a `needs_you`
 * reason (D11): each field's label, and why it was not filled.
 */
export function MissingFieldsList({ fields }: { fields: readonly MissingField[] }) {
  if (fields.length === 0) return null;
  return (
    <Box component="ul" aria-label="Fields you need to answer" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
      {fields.map((field) => (
        <Typography key={field.id} component="li" variant="caption" color="text.secondary">
          <Box component="span" sx={{ color: "text.primary", fontWeight: 500 }}>
            {field.label}
          </Box>
          {` — ${field.why}`}
        </Typography>
      ))}
    </Box>
  );
}

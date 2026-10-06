/**
 * The Evaluations of a Run as a table (shown to the user as "Jobs"), one row per Job Key, updated in place
 * as `eval` events arrive.
 */
import Chip from "@mui/material/Chip";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import {
  HELD_REASONS,
  MAX_AI_EVALS,
  SKIP_REASONS,
  type Ats,
  type Evaluation,
  type PostingSource,
} from "@auto-apply/shared";
import { StatusChip, VerdictChip } from "../ui/StatusChip";

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
};

function reasonText({ status, reason }: Pick<Evaluation, "status" | "reason">): string {
  if (reason === null) return "—";
  return fixedReasonText[status]?.[reason] ?? reason;
}

/** Labels a score the keyword matcher produced instead of the AI (D24). */
function FallbackLabel({ scoredBy }: Pick<Evaluation, "scoredBy">) {
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

export function EvaluationsTable({ evaluations }: { evaluations: Evaluation[] }) {
  return (
    <TableContainer>
      <Table size="small" aria-label="Jobs in this run">
        <TableHead>
          <TableRow>
            <TableCell>Company</TableCell>
            <TableCell>Role</TableCell>
            <TableCell>Source</TableCell>
            <TableCell>Verdict</TableCell>
            <TableCell align="right">Score</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Reason</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {evaluations.map(({ jobKey, posting, verdict, score, scoredBy, status, reason }) => (
            <TableRow key={jobKey} hover>
              <TableCell sx={{ whiteSpace: "nowrap" }}>{posting.company}</TableCell>
              <TableCell sx={{ fontWeight: 500 }}>{posting.title}</TableCell>
              <TableCell sx={{ whiteSpace: "nowrap" }}>
                {atsLabels[posting.ats]}
                <Typography component="span" variant="body2" color="text.secondary">
                  {" "}
                  · {posting.board}
                </Typography>
                <SourceLabel source={posting.source} />
              </TableCell>
              <TableCell>
                <VerdictChip verdict={verdict} />
              </TableCell>
              <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                {score === null ? "—" : Math.round(score)}
                <FallbackLabel scoredBy={scoredBy} />
              </TableCell>
              <TableCell>
                <StatusChip status={status} />
              </TableCell>
              <TableCell sx={{ color: "text.secondary", minWidth: 200 }}>{reasonText({ status, reason })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

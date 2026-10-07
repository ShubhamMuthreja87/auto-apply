/**
 * Scanned jobs (ticket 12, D20): every stored Evaluation — across Runs, or for
 * one selected Run — with its Verdict, status, reason, whether the keyword
 * matcher scored it (D24), and the per-criterion evidence behind the score (D7).
 * Read-only, from the API; the browser never touches Firebase.
 */
import { Fragment, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CircularProgress from "@mui/material/CircularProgress";
import Collapse from "@mui/material/Collapse";
import FormControl from "@mui/material/FormControl";
import IconButton from "@mui/material/IconButton";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import {
  SKIP_REASONS,
  type CriterionEvidence,
  type Evaluation,
  type Run,
  type ScoredBy,
} from "@auto-apply/shared";
import { listEvaluations, listRuns } from "../api";
import { useLoad, type LoadState } from "../useLoad";
import { formatDate } from "../ui/formatDate";
import { StatusChip, VerdictChip } from "../ui/StatusChip";
import {
  FallbackLabel,
  MissingFieldsList,
  PostingSourceCell,
  reasonText,
  scoreText,
} from "../run/evaluationCells";

const ALL_RUNS = "all";
const COLUMNS = 8;

/**
 * Seen Postings are no longer recorded (they only count in the Run's
 * `alreadySeen`), but Runs from before that stored them as `skipped: seen`;
 * they are not jobs that Run scanned, so they are left out.
 */
function isLegacySeenSkip({ status, reason }: Evaluation): boolean {
  return status === "skipped" && reason === SKIP_REASONS.seen;
}

export function ScannedJobsPage() {
  const [selected, setSelected] = useState<string>(ALL_RUNS);
  const runs = useLoad(listRuns, "runs");
  const evaluations = useLoad(
    () => listEvaluations(selected === ALL_RUNS ? null : selected),
    selected,
  );

  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}
      >
        <Box>
          <Typography variant="h1">Scanned jobs</Typography>
          <Typography color="text.secondary">
            Every job a run evaluated, and why it was blocked, skipped, held or applied to.
          </Typography>
        </Box>
        {runs.kind === "ready" && runs.data.length > 0 && (
          <RunSelect runs={runs.data} value={selected} onChange={setSelected} />
        )}
      </Stack>

      <Card>
        <ScannedBody runs={runs} evaluations={evaluations} allRuns={selected === ALL_RUNS} />
      </Card>
    </Stack>
  );
}

function RunSelect({
  runs,
  value,
  onChange,
}: {
  runs: Run[];
  value: string;
  onChange: (runId: string) => void;
}) {
  return (
    <FormControl size="small" sx={{ minWidth: 260 }}>
      <InputLabel id="scanned-run-label">Run</InputLabel>
      <Select
        labelId="scanned-run-label"
        label="Run"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <MenuItem value={ALL_RUNS}>All runs</MenuItem>
        {runs.map((run) => (
          <MenuItem key={run.runId} value={run.runId}>
            {formatDate(run.createdAt)} · {run.status}
            {run.preferencesPreset === "demo" && " · Demo preferences"}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

function ScannedBody({
  runs,
  evaluations,
  allRuns,
}: {
  runs: LoadState<Run[]>;
  evaluations: LoadState<Evaluation[]>;
  allRuns: boolean;
}) {
  const failed = [runs, evaluations].find((state) => state.kind === "error");
  if (failed?.kind === "error") {
    return (
      <CardContent>
        <Alert severity="error">Could not load scanned jobs: {failed.message}</Alert>
      </CardContent>
    );
  }
  if (evaluations.kind !== "ready") {
    return (
      <CardContent sx={{ py: 6, textAlign: "center" }}>
        <CircularProgress size={28} aria-label="Loading scanned jobs" />
      </CardContent>
    );
  }
  const scanned = evaluations.data.filter((evaluation) => !isLegacySeenSkip(evaluation));
  if (scanned.length === 0) {
    return (
      <CardContent sx={{ py: 6, textAlign: "center" }}>
        <Typography variant="h3" gutterBottom>
          {allRuns ? "No jobs scanned yet" : "No jobs in this run"}
        </Typography>
        <Typography color="text.secondary">
          {allRuns
            ? "Start a run from the Run tab; every job it evaluates is listed here."
            : "This run found no new jobs: they were all seen in earlier runs, or it ended first."}
        </Typography>
      </CardContent>
    );
  }
  return <ScannedTable evaluations={scanned} />;
}

function ScannedTable({ evaluations }: { evaluations: Evaluation[] }) {
  return (
    <TableContainer>
      <Table size="small" aria-label="Scanned jobs">
        <TableHead>
          <TableRow>
            <TableCell padding="checkbox" />
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
          {evaluations.map((evaluation) => (
            <ScannedRow key={`${evaluation.runId}/${evaluation.jobKey}`} evaluation={evaluation} />
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function ScannedRow({ evaluation }: { evaluation: Evaluation }) {
  const [open, setOpen] = useState(false);
  const { posting, verdict, score, scoredBy, status, reason, missingFields, evidence, createdAt } =
    evaluation;

  return (
    <Fragment>
      <TableRow hover sx={{ "& > td": { borderBottom: open ? "none" : undefined } }}>
        <TableCell padding="checkbox">
          <IconButton
            size="small"
            aria-label={`${open ? "Hide" : "Show"} evidence for ${posting.title}`}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
          </IconButton>
        </TableCell>
        <TableCell sx={{ whiteSpace: "nowrap" }}>{posting.company}</TableCell>
        <TableCell sx={{ fontWeight: 500 }}>
          {posting.title}
          <Typography component="div" variant="caption" color="text.secondary">
            Scanned {formatDate(createdAt)}
          </Typography>
        </TableCell>
        <TableCell sx={{ whiteSpace: "nowrap" }}>
          <PostingSourceCell posting={posting} />
        </TableCell>
        <TableCell>
          <VerdictChip verdict={verdict} />
        </TableCell>
        <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
          {scoreText(score)}
          <FallbackLabel scoredBy={scoredBy} />
        </TableCell>
        <TableCell>
          <StatusChip status={status} />
        </TableCell>
        <TableCell sx={{ color: "text.secondary", minWidth: 200 }}>
          {reasonText({ status, reason })}
          <MissingFieldsList fields={missingFields} />
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={COLUMNS} sx={{ py: 0, ...(open ? {} : { borderBottom: "none" }) }}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box sx={{ py: 2, pl: 6 }}>
              <EvidenceTable title={posting.title} evidence={evidence} scoredBy={scoredBy} />
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </Fragment>
  );
}

/** Who judged a criterion, in words: code, the AI, or the keyword matcher standing in for it. */
function judgeText({ judgedBy }: CriterionEvidence, scoredBy: ScoredBy | null): string {
  if (judgedBy === "code") return "Code";
  return scoredBy === "fallback" ? "Keyword matcher" : "AI";
}

function EvidenceTable({
  title,
  evidence,
  scoredBy,
}: {
  title: string;
  evidence: CriterionEvidence[];
  scoredBy: ScoredBy | null;
}) {
  if (evidence.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        Not scored, so there is no per-criterion evidence: the reason above is the whole story.
      </Typography>
    );
  }
  return (
    <Table size="small" aria-label={`Evidence for ${title}`}>
      <TableHead>
        <TableRow>
          <TableCell>Criterion</TableCell>
          <TableCell>Judged by</TableCell>
          <TableCell>Result</TableCell>
          <TableCell>Evidence</TableCell>
          <TableCell align="right">Points</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {evidence.map((item) => (
          <TableRow key={item.criterionId}>
            <TableCell>
              {item.label}
              <Typography component="div" variant="caption" color="text.secondary">
                weight {item.weight > 0 ? `+${item.weight}` : item.weight}
              </Typography>
            </TableCell>
            <TableCell sx={{ whiteSpace: "nowrap" }}>{judgeText(item, scoredBy)}</TableCell>
            <TableCell sx={{ whiteSpace: "nowrap" }}>{item.met ? "Met" : "Not met"}</TableCell>
            <TableCell sx={{ color: "text.secondary" }}>
              {item.evidence === "" ? "—" : `“${item.evidence}”`}
            </TableCell>
            <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
              {item.points > 0 ? `+${item.points}` : item.points}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * Applied jobs (ticket 11, D20): every job a Run tried to submit, with the
 * payload built for it. Every submission is simulated — built and stored,
 * never sent (D18) — and the page says so first. The Run's deliberate first
 * failure (D19) carries a Retry that resubmits it.
 */
import { useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import {
  FAILED_REASONS,
  type Evaluation,
  type SimulatedSubmission,
  type SubmittedAnswer,
} from "@auto-apply/shared";
import { listEvaluations, messageOf, retrySubmit } from "../api";
import { useLoad } from "../useLoad";
import { formatDate } from "../ui/formatDate";
import { StatusChip } from "../ui/StatusChip";
import { PostingSourceCell, reasonText } from "../run/evaluationCells";

const idOf = (e: Pick<Evaluation, "runId" | "jobKey">) => `${e.runId}/${e.jobKey}`;

const sourceText: Record<SubmittedAnswer["source"], string> = {
  profile: "Profile",
  settings: "Settings",
  ai: "AI",
};

function answerText({ value }: SubmittedAnswer): string {
  return typeof value === "string" ? value : value.map((option) => option.label).join(", ");
}

const isRetryable = (e: Evaluation) =>
  e.status === "failed" && e.reason === FAILED_REASONS.simulated;

export function AppliedJobsPage() {
  const evaluations = useLoad(() => listEvaluations(null), "applied");
  /** Evaluations a Retry has updated since the list loaded, by run and Job Key. */
  const [updated, setUpdated] = useState<ReadonlyMap<string, Evaluation>>(new Map());

  const onRetried = (evaluation: Evaluation) =>
    setUpdated((current) => new Map(current).set(idOf(evaluation), evaluation));

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h1">Applied jobs</Typography>
        <Typography color="text.secondary">
          Every job a run submitted, and the application payload built for it.
        </Typography>
      </Box>

      <Alert severity="info" variant="outlined">
        Submissions are simulated. The real Greenhouse payload is built and stored, but never sent:
        no application reaches an employer.
      </Alert>

      <Card>
        {evaluations.kind === "error" ? (
          <CardContent>
            <Alert severity="error">Could not load applied jobs: {evaluations.message}</Alert>
          </CardContent>
        ) : evaluations.kind === "loading" ? (
          <CardContent sx={{ py: 6, textAlign: "center" }}>
            <CircularProgress size={28} aria-label="Loading applied jobs" />
          </CardContent>
        ) : (
          <AppliedBody
            evaluations={evaluations.data
              .filter((e) => e.submission !== null)
              .map((e) => updated.get(idOf(e)) ?? e)}
            onRetried={onRetried}
          />
        )}
      </Card>
    </Stack>
  );
}

function AppliedBody({
  evaluations,
  onRetried,
}: {
  evaluations: Evaluation[];
  onRetried: (evaluation: Evaluation) => void;
}) {
  const [viewing, setViewing] = useState<Evaluation | null>(null);

  if (evaluations.length === 0) {
    return (
      <CardContent sx={{ py: 6, textAlign: "center" }}>
        <Typography variant="h3" gutterBottom>
          No applications yet
        </Typography>
        <Typography color="text.secondary">
          When a run finds an APPLY NOW job whose form it can fill in full, its simulated submission
          is listed here.
        </Typography>
      </CardContent>
    );
  }
  return (
    <>
      <TableContainer>
        <Table size="small" aria-label="Applied jobs">
          <TableHead>
            <TableRow>
              <TableCell>Company</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Source</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Reason</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {evaluations.map((evaluation) => (
              <AppliedRow
                key={idOf(evaluation)}
                evaluation={evaluation}
                onView={() => setViewing(evaluation)}
                onRetried={(retried) => {
                  onRetried(retried);
                  // D19: "Retry shows the payload and succeeds".
                  setViewing(retried);
                }}
              />
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {viewing?.submission && (
        <PayloadDialog
          title={`${viewing.posting.company} · ${viewing.posting.title}`}
          submission={viewing.submission}
          onClose={() => setViewing(null)}
        />
      )}
    </>
  );
}

function AppliedRow({
  evaluation,
  onView,
  onRetried,
}: {
  evaluation: Evaluation;
  onView: () => void;
  onRetried: (evaluation: Evaluation) => void;
}) {
  const [retry, setRetry] = useState<
    { kind: "idle" | "pending" } | { kind: "error"; message: string }
  >({ kind: "idle" });
  const { posting, status, reason, submission } = evaluation;

  async function onRetry() {
    setRetry({ kind: "pending" });
    try {
      onRetried(await retrySubmit(evaluation.runId, evaluation.jobKey));
      setRetry({ kind: "idle" });
    } catch (err) {
      setRetry({ kind: "error", message: messageOf(err) });
    }
  }

  return (
    <TableRow hover>
      <TableCell sx={{ whiteSpace: "nowrap" }}>{posting.company}</TableCell>
      <TableCell sx={{ fontWeight: 500 }}>
        {posting.title}
        {submission && (
          <Typography component="div" variant="caption" color="text.secondary">
            Built {formatDate(submission.builtAt)} · attempt {submission.attempt}
          </Typography>
        )}
      </TableCell>
      <TableCell sx={{ whiteSpace: "nowrap" }}>
        <PostingSourceCell posting={posting} />
      </TableCell>
      <TableCell>
        <StatusChip status={status} />
      </TableCell>
      <TableCell sx={{ color: "text.secondary", minWidth: 180 }}>
        {status === "submitted" ? "Submitted (simulated)" : reasonText({ status, reason })}
        {retry.kind === "error" && (
          <Alert severity="error" sx={{ mt: 1 }}>
            Retry failed: {retry.message}
          </Alert>
        )}
      </TableCell>
      <TableCell align="right">
        <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
          <Button size="small" variant="outlined" onClick={onView}>
            View payload
          </Button>
          {isRetryable(evaluation) && (
            <Button
              size="small"
              variant="contained"
              onClick={() => void onRetry()}
              disabled={retry.kind === "pending"}
            >
              {retry.kind === "pending" ? "Retrying…" : "Retry"}
            </Button>
          )}
        </Stack>
      </TableCell>
    </TableRow>
  );
}

function PayloadDialog({
  title,
  submission,
  onClose,
}: {
  title: string;
  submission: SimulatedSubmission;
  onClose: () => void;
}) {
  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth aria-labelledby="payload-title">
      <DialogTitle id="payload-title">Payload · {title}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Alert severity="info" variant="outlined">
            Not sent. A real submit would {submission.method} this to {submission.endpoint}; the
            prototype only builds and stores it (attempt {submission.attempt}).
          </Alert>
          <Table size="small" aria-label="Answered fields">
            <TableHead>
              <TableRow>
                <TableCell>Field</TableCell>
                <TableCell>Field id</TableCell>
                <TableCell>Answer</TableCell>
                <TableCell>Source</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {submission.answers.map((answer) => (
                <TableRow key={answer.id}>
                  <TableCell>{answer.label}</TableCell>
                  <TableCell sx={{ fontFamily: "monospace" }}>{answer.id}</TableCell>
                  <TableCell>{answerText(answer)}</TableCell>
                  <TableCell>{sourceText[answer.source]}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Payload (JSON)
            </Typography>
            <Box
              component="pre"
              sx={{
                m: 0,
                p: 2,
                borderRadius: 1,
                bgcolor: "action.hover",
                fontSize: "0.8125rem",
                overflowX: "auto",
              }}
            >
              {JSON.stringify(submission.payload, null, 2)}
            </Box>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

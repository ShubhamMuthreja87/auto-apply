/**
 * The Auto-apply button and the live Run view (D20). On load it reattaches to
 * the user's active Run, so a refresh mid-Run loses nothing; the button starts
 * a new Run and stays disabled while one is active (the API's 409 backs it up).
 */
import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CircularProgress from "@mui/material/CircularProgress";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import BoltIcon from "@mui/icons-material/Bolt";
import TravelExploreIcon from "@mui/icons-material/TravelExplore";
import { isRunActive, type Run, type RunFunnel, type RunStatus } from "@auto-apply/shared";
import { ApiError, getActiveRun, messageOf, startRun } from "../api";
import { ConnectionIndicator } from "../ui/ConnectionIndicator";
import { StatusChip } from "../ui/StatusChip";
import { EvaluationsTable } from "./EvaluationsTable";
import { useRunStream } from "./useRunStream";

const funnelLabels: [keyof RunFunnel, string][] = [
  ["discovered", "Discovered"],
  ["evaluated", "Evaluated"],
  ["blocked", "Blocked"],
  ["skipped", "Skipped"],
  ["held", "Held (needs you)"],
  ["submitted", "Submitted (simulated)"],
  ["failed", "Failed"],
];

/**
 * How far through its discovered jobs the Run is, as a percentage; `null`
 * while discovering, when the total is not known yet.
 */
function progressOf(run: Run): number | null {
  if (!isRunActive(run.status)) return 100;
  if (run.status === "discovering") return null;
  const { discovered, blocked, skipped, held, submitted, failed } = run.funnel;
  if (discovered === 0) return 0;
  return Math.min(
    100,
    Math.round(((blocked + skipped + held + submitted + failed) / discovered) * 100),
  );
}

function InlineLoading({ label }: { label: string }) {
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", color: "text.secondary" }}>
      <CircularProgress size={16} color="inherit" aria-hidden="true" />
      <Typography variant="body2">{label}</Typography>
    </Stack>
  );
}

function NoRunsYet() {
  return (
    <Card>
      <CardContent sx={{ py: 7, textAlign: "center" }}>
        <TravelExploreIcon
          sx={{ fontSize: 40, color: "text.disabled", mb: 1 }}
          aria-hidden="true"
        />
        <Typography variant="h3" gutterBottom>
          No runs yet
        </Typography>
        <Typography color="text.secondary" sx={{ maxWidth: 460, mx: "auto" }}>
          Press Auto-apply to discover jobs, score each one against your profile and build the
          applications. Nothing is ever sent to an employer.
        </Typography>
      </CardContent>
    </Card>
  );
}

const progressColors: Record<RunStatus, "primary" | "success" | "error"> = {
  discovering: "primary",
  evaluating: "primary",
  applying: "primary",
  completed: "success",
  failed: "error",
};

export function RunPanel() {
  const [runId, setRunId] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const stream = useRunStream(runId);

  useEffect(() => {
    let cancelled = false;
    getActiveRun()
      .then((run) => {
        if (!cancelled && run) setRunId(run.runId);
      })
      .catch((err: unknown) => {
        if (!cancelled) setStartError(`Could not load the active run: ${messageOf(err)}`);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onAutoApply() {
    setStarting(true);
    setStartError(null);
    try {
      setRunId(await startRun());
    } catch (err) {
      if (err instanceof ApiError && err.code === "run_active") {
        // Started elsewhere (another tab): follow that Run instead.
        try {
          const active = await getActiveRun();
          if (active) setRunId(active.runId);
          else setStartError("The other run has just finished. Try again.");
        } catch (lookupErr) {
          setStartError(`Could not load the active run: ${messageOf(lookupErr)}`);
        }
      } else {
        setStartError(`Could not start a run: ${messageOf(err)}`);
      }
    } finally {
      setStarting(false);
    }
  }

  const { run } = stream;
  // Waiting for the first snapshot counts as active, so a double click cannot
  // slip in between POST and stream.
  const runActive = run ? isRunActive(run.status) : runId !== null;
  const progress = run ? progressOf(run) : null;

  return (
    <Stack component="section" aria-label="Auto-apply" spacing={3}>
      <Card>
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}
          >
            <Box>
              <Typography variant="h1" gutterBottom>
                Auto-apply
              </Typography>
              <Typography color="text.secondary">
                Find matching jobs, score them against your profile and prepare applications.
              </Typography>
            </Box>
            <Button
              variant="contained"
              size="large"
              onClick={onAutoApply}
              disabled={checking || starting || runActive}
              startIcon={
                starting ? (
                  <CircularProgress size={16} color="inherit" aria-hidden="true" />
                ) : (
                  <BoltIcon />
                )
              }
              sx={{ flexShrink: 0, px: 3 }}
            >
              {starting ? "Starting…" : "Auto-apply"}
            </Button>
          </Stack>

          {runId && (
            <Box sx={{ mt: 3 }}>
              <Stack
                direction="row"
                spacing={2}
                sx={{ justifyContent: "space-between", alignItems: "center", mb: 1.5 }}
              >
                <Box component="dl" sx={{ display: "flex", alignItems: "center", gap: 1, m: 0 }}>
                  <Typography component="dt" variant="body2" color="text.secondary">
                    Status
                  </Typography>
                  <Box component="dd" sx={{ m: 0 }}>
                    {run ? <StatusChip status={run.status} /> : "—"}
                  </Box>
                </Box>
                <ConnectionIndicator connection={stream.connection} />
              </Stack>
              <LinearProgress
                aria-label="Run progress"
                variant={progress === null ? "indeterminate" : "determinate"}
                value={progress ?? undefined}
                color={run ? progressColors[run.status] : "primary"}
                sx={{ height: 6, borderRadius: 3 }}
              />
            </Box>
          )}
        </CardContent>
      </Card>

      {startError && <Alert severity="error">{startError}</Alert>}
      {stream.error && <Alert severity="error">Stream error: {stream.error}</Alert>}
      {run?.reason && (
        <Alert severity={run.status === "failed" ? "error" : "info"}>{run.reason}</Alert>
      )}

      {!runId ? (
        checking ? (
          <InlineLoading label="Checking for an active run…" />
        ) : (
          <NoRunsYet />
        )
      ) : !run ? (
        <InlineLoading label="Loading run…" />
      ) : (
        <>
          <Box
            component="dl"
            aria-label="Funnel"
            sx={{
              m: 0,
              display: "grid",
              gap: 1.5,
              gridTemplateColumns: {
                xs: "repeat(2, 1fr)",
                sm: "repeat(4, 1fr)",
                md: "repeat(7, 1fr)",
              },
            }}
          >
            {funnelLabels.map(([key, label]) => (
              <Card
                key={key}
                sx={{
                  px: 2,
                  py: 1.5,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <Typography component="dt" variant="caption" color="text.secondary">
                  {label}
                </Typography>
                <Typography
                  component="dd"
                  sx={{
                    m: 0,
                    fontSize: "1.5rem",
                    fontWeight: 600,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {run.funnel[key]}
                </Typography>
              </Card>
            ))}
          </Box>

          <Card>
            <Box sx={{ px: { xs: 2, sm: 3 }, pt: 2, pb: 1 }}>
              <Typography variant="h2">Jobs</Typography>
            </Box>
            {stream.evaluations.length === 0 ? (
              <Typography color="text.secondary" sx={{ px: { xs: 2, sm: 3 }, pb: 3 }}>
                No jobs yet.
              </Typography>
            ) : (
              <EvaluationsTable evaluations={stream.evaluations} />
            )}
          </Card>
        </>
      )}
    </Stack>
  );
}

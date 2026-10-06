/**
 * The one way a Run or Evaluation status, or a Verdict, is shown anywhere in
 * the UI (ticket 05b). Always colour plus text, never colour alone; statuses
 * still in progress carry a spinner and `aria-busy`.
 */
import Chip, { type ChipProps } from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Box from "@mui/material/Box";
import type { EvaluationStatus, RunStatus, Verdict } from "@auto-apply/shared";

type Status = RunStatus | EvaluationStatus;

interface Look {
  label: string;
  color: ChipProps["color"];
  variant: ChipProps["variant"];
  busy?: boolean;
}

const looks: Record<Status, Look> = {
  discovering: { label: "Discovering", color: "info", variant: "outlined", busy: true },
  evaluating: { label: "Evaluating", color: "info", variant: "outlined", busy: true },
  applying: { label: "Applying", color: "info", variant: "outlined", busy: true },
  completed: { label: "Completed", color: "success", variant: "filled" },
  queued: { label: "Queued", color: "default", variant: "filled" },
  held: { label: "Needs you", color: "warning", variant: "filled" },
  skipped: { label: "Skipped", color: "default", variant: "outlined" },
  blocked: { label: "Blocked", color: "error", variant: "outlined" },
  submitted: { label: "Submitted", color: "success", variant: "filled" },
  failed: { label: "Failed", color: "error", variant: "filled" },
};

export function StatusChip({ status }: { status: Status }) {
  const look = looks[status];
  return (
    <Chip
      data-testid="status-chip"
      data-status={status}
      aria-busy={look.busy ? true : undefined}
      size="small"
      color={look.color}
      variant={look.variant}
      icon={
        look.busy ? <CircularProgress size={12} color="inherit" aria-hidden="true" /> : undefined
      }
      label={
        status === "submitted" ? (
          <>
            {look.label}{" "}
            <Box
              component="span"
              sx={{
                ml: 0.5,
                px: 0.75,
                py: 0.125,
                borderRadius: 1,
                fontSize: "0.6875rem",
                bgcolor: "rgba(255, 255, 255, 0.25)",
              }}
            >
              simulated
            </Box>
          </>
        ) : (
          look.label
        )
      }
    />
  );
}

const verdictLooks: Record<Verdict, Omit<Look, "busy">> = {
  APPLY_NOW: { label: "APPLY NOW", color: "primary", variant: "filled" },
  APPLY: { label: "APPLY", color: "primary", variant: "outlined" },
  STRETCH: { label: "STRETCH", color: "default", variant: "outlined" },
  BLOCKED: { label: "BLOCKED", color: "error", variant: "outlined" },
};

export function VerdictChip({ verdict }: { verdict: Verdict | null }) {
  if (!verdict) {
    return (
      <Box component="span" sx={{ color: "text.secondary" }}>
        —
      </Box>
    );
  }
  const look = verdictLooks[verdict];
  return <Chip size="small" label={look.label} color={look.color} variant={look.variant} />;
}

/**
 * The live stream's connection state (CODING_STANDARDS, Web): a coloured dot
 * plus a word, never the dot alone.
 */
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { Connection } from "../run/useRunStream";

const looks: Record<Connection, { label: string; color: string; pulse: boolean }> = {
  connecting: { label: "Connecting…", color: "info.main", pulse: true },
  live: { label: "Live", color: "success.main", pulse: true },
  reconnecting: { label: "Reconnecting…", color: "warning.main", pulse: true },
  closed: { label: "Closed", color: "text.disabled", pulse: false },
};

export function ConnectionIndicator({ connection }: { connection: Connection }) {
  const look = looks[connection];
  return (
    <Stack
      direction="row"
      spacing={0.75}
      sx={{ alignItems: "center" }}
      data-testid="connection"
      title="Live updates from the server"
    >
      <Box
        aria-hidden="true"
        sx={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          bgcolor: look.color,
          ...(look.pulse && {
            "@keyframes pulse": { "50%": { opacity: 0.35 } },
            animation: "pulse 1.6s ease-in-out infinite",
            "@media (prefers-reduced-motion: reduce)": { animation: "none" },
          }),
        }}
      />
      <Typography variant="body2" color="text.secondary">
        {look.label}
      </Typography>
    </Stack>
  );
}

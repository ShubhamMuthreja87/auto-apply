/**
 * A view whose ticket has not landed yet (Applied jobs: 11, Scanned jobs and
 * Settings: 12). It says so plainly instead of showing an empty list that looks
 * like real data.
 */
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <Stack spacing={3}>
      <Typography variant="h1">{title}</Typography>
      <Card>
        <CardContent sx={{ py: 6, textAlign: "center" }}>
          <Typography variant="h3" gutterBottom>
            Not built yet
          </Typography>
          <Typography color="text.secondary">{description}</Typography>
        </CardContent>
      </Card>
    </Stack>
  );
}

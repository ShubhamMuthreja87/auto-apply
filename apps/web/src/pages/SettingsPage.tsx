/**
 * Settings (ticket 12, D20): the stored user document — profile, the
 * preferences rubric that drives matching (D6, D7, D8) and the application
 * settings that fill forms (D9) — shown read-only from `GET /api/me`. Editing
 * is a later ticket. Unanswered settings read as user-only (D9, D11).
 */
import type { ReactNode } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import type { ApplicationSettings, User, UserPreferences, UserProfile } from "@auto-apply/shared";
import { getMe } from "../api";
import { useLoad, type LoadState } from "../useLoad";

export function SettingsPage() {
  const me = useLoad(getMe, "me");

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h1">Settings</Typography>
        <Typography color="text.secondary">
          Read-only for now: the stored profile, preferences and settings each run reads.
        </Typography>
      </Box>
      <SettingsBody state={me} />
    </Stack>
  );
}

function SettingsBody({ state }: { state: LoadState<User> }) {
  if (state.kind === "loading") {
    return (
      <Card>
        <CardContent sx={{ py: 6, textAlign: "center" }}>
          <CircularProgress size={28} aria-label="Loading settings" />
        </CardContent>
      </Card>
    );
  }
  if (state.kind === "error" && state.code === "user_not_found") {
    return (
      <Card>
        <CardContent sx={{ py: 6, textAlign: "center" }}>
          <Typography variant="h3" gutterBottom>
            No profile yet
          </Typography>
          <Typography color="text.secondary">
            The API seeds the user document on first boot; restart it to create one.
          </Typography>
        </CardContent>
      </Card>
    );
  }
  if (state.kind === "error") {
    return <Alert severity="error">Could not load settings: {state.message}</Alert>;
  }
  const { profile, preferences, settings } = state.data;
  return (
    <>
      <ProfileSection profile={profile} />
      <PreferencesSection preferences={preferences} />
      <ApplicationSettingsSection settings={settings} />
    </>
  );
}

/* ----------------------------- building blocks ----------------------------- */

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardContent>
        <Typography variant="h2" sx={{ mb: 2 }}>
          {title}
        </Typography>
        <Stack spacing={3}>{children}</Stack>
      </CardContent>
    </Card>
  );
}

function SubSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box>
      <Typography variant="h3" sx={{ mb: 1 }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

type Value = string | number | boolean | null | readonly string[];

function valueText(value: Exclude<Value, null>): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  return value.length === 0 ? "None" : value.join(", ");
}

/** Label/value pairs as a definition list; `null` reads as `emptyText`. */
function FieldList({
  fields,
  emptyText = "Not set",
}: {
  fields: [label: string, value: Value][];
  emptyText?: string;
}) {
  return (
    <Box
      component="dl"
      sx={{
        m: 0,
        display: "grid",
        gridTemplateColumns: { xs: "1fr", sm: "220px 1fr" },
        columnGap: 2,
        rowGap: 1,
      }}
    >
      {fields.map(([label, value]) => (
        <Box key={label} sx={{ display: "contents" }}>
          <Typography component="dt" variant="body2" color="text.secondary">
            {label}
          </Typography>
          <Typography
            component="dd"
            variant="body2"
            color={value === null ? "text.secondary" : "text.primary"}
            sx={{ m: 0, mb: { xs: 1, sm: 0 } }}
          >
            {value === null ? emptyText : valueText(value)}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

/** A plain read-only MUI table: a header row and string cells. */
function SimpleTable({
  label,
  head,
  rows,
}: {
  label: string;
  head: string[];
  rows: { key: string; cells: ReactNode[] }[];
}) {
  return (
    <TableContainer>
      <Table size="small" aria-label={label}>
        <TableHead>
          <TableRow>
            {head.map((cell) => (
              <TableCell key={cell}>{cell}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.key}>
              {row.cells.map((cell, index) => (
                <TableCell key={index}>{cell}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

/** A rule's label with the job-search prompt wording it came from (D6). */
function Sourced({ label, source }: { label: string; source: string }) {
  return (
    <>
      {label}
      <Typography component="div" variant="caption" color="text.secondary">
        “{source}”
      </Typography>
    </>
  );
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
const listText = (items: readonly string[]) => valueText(items);

/* --------------------------------- sections -------------------------------- */

function ProfileSection({ profile }: { profile: UserProfile }) {
  return (
    <Section title="Profile">
      <FieldList
        fields={[
          ["Name", profile.fullName],
          ["Email", profile.email],
          ["Phone", profile.phone],
          ["Location", profile.location],
          ["LinkedIn", profile.links.linkedin],
          ["GitHub", profile.links.github],
          ["Website", profile.links.website],
          ["Headline", profile.headline],
          ["Summary", profile.summary],
        ]}
      />
      <SubSection title="Experience">
        <SimpleTable
          label="Experience"
          head={["Company", "Title", "Dates", "Highlights"]}
          rows={profile.experience.map((entry) => ({
            key: `${entry.company}-${entry.start}`,
            cells: [
              entry.company,
              entry.title,
              `${entry.start} – ${entry.end ?? "present"}`,
              entry.highlights.join(" · "),
            ],
          }))}
        />
      </SubSection>
      <SubSection title="Skills">
        <FieldList fields={profile.skills.map(({ category, items }) => [category, items])} />
      </SubSection>
      <SubSection title="Education">
        <SimpleTable
          label="Education"
          head={["Degree", "School", "Years"]}
          rows={profile.education.map((entry) => ({
            key: `${entry.degree}-${entry.school}`,
            cells: [
              entry.degree,
              entry.school,
              [entry.startYear, entry.endYear].map((year) => year ?? "?").join(" – "),
            ],
          }))}
        />
      </SubSection>
      <SubSection title="Leadership">
        <FieldList fields={[["Highlights", profile.leadership]]} />
      </SubSection>
    </Section>
  );
}

function PreferencesSection({ preferences: p }: { preferences: UserPreferences }) {
  return (
    <Section title="Preferences">
      <FieldList
        fields={[
          ["Region", p.region],
          ["Goal", p.goal.text],
          ["Accepted locations", p.location.accepted],
          ["Remote open to", p.location.remoteOpenTo],
          ["Strong stack", p.stack.strong],
          ["Working knowledge", p.stack.workingKnowledge],
          ["Not in stack", p.stack.not],
          ["Excluded titles", p.excludedTitles.terms],
          ["Large companies allowed", p.companyBlocks.allowedExceptions.companies],
          [
            "Verdict bands",
            `APPLY NOW at ${p.verdictBands.applyNowMinFit}+ · APPLY at ${p.verdictBands.applyMinFit}+ · fit capped at ${p.fitCap}`,
          ],
          [
            "Answer framing",
            `${p.tierFraming.manager} for manager titles, ${p.tierFraming.ic} for IC titles`,
          ],
        ]}
      />
      <SubSection title="Fit criteria">
        <SimpleTable
          label="Fit criteria"
          head={["Criterion", "Weight", "Group", "Keyword terms"]}
          rows={p.fitCriteria.map((c) => ({
            key: c.id,
            cells: [
              <Sourced key="label" label={c.label} source={c.source} />,
              signed(c.weight),
              c.group ?? "—",
              listText(c.terms),
            ],
          }))}
        />
      </SubSection>
      <SubSection title="Hard blocks">
        <SimpleTable
          label="Hard blocks"
          head={["Rule", "Terms", "Threshold"]}
          rows={p.hardBlocks.map((rule) => ({
            key: rule.id,
            cells: [
              <Sourced key="label" label={rule.label} source={rule.source} />,
              listText(rule.terms),
              rule.threshold === null ? "—" : String(rule.threshold),
            ],
          }))}
        />
      </SubSection>
      <SubSection title="Blocked companies">
        <SimpleTable
          label="Blocked companies"
          head={["Category", "Companies"]}
          rows={p.companyBlocks.categories.map((category) => ({
            key: category.id,
            cells: [
              <Sourced key="label" label={category.label} source={category.source} />,
              listText(category.companies),
            ],
          }))}
        />
      </SubSection>
      <SubSection title="Language gate">
        <SimpleTable
          label="Language gate"
          head={["Rule", "Terms", "Verdict capped at"]}
          rows={p.languageGate.map((rule) => ({
            key: rule.id,
            cells: [
              <Sourced key="label" label={rule.label} source={rule.source} />,
              listText(rule.terms),
              rule.cap,
            ],
          }))}
        />
      </SubSection>
    </Section>
  );
}

const withUnit = (value: number | null, unit: string) =>
  value === null ? null : `${value} ${unit}`;

function ApplicationSettingsSection({ settings: s }: { settings: ApplicationSettings }) {
  return (
    <Section title="Application settings">
      <FieldList
        emptyText="Not set · you answer this"
        fields={[
          ["Current location", s.location.current],
          ["Postal address", s.location.postalAddress],
          ["Willing to relocate", s.location.willingToRelocate],
          ["Relocation scope", s.location.relocationScope],
          ["Work arrangement", s.location.workArrangement],
          ["Work authorization", s.location.workAuthorizationCountries],
          ["Requires visa sponsorship", s.location.requiresVisaSponsorship],
          ["Citizenship", s.location.citizenship],
          ["Notice period", withUnit(s.availability.noticePeriodDays, "days")],
          ["Earliest start date", s.availability.earliestStartDate],
          ["Highest degree", s.education.highestDegree],
          ["School", s.education.school],
          ["Graduation year", s.education.graduationYear],
          ["Total experience", withUnit(s.experience.totalYears, "years")],
          ["People management", withUnit(s.experience.peopleManagementYears, "years")],
          ["Largest team managed", s.experience.largestTeamManaged],
          ["Résumé URL", s.documents.resumeUrl],
          ["Cover letter", s.documents.coverLetter],
          ["How did you hear about us", s.other.howDidYouHear],
          ["Pronouns", s.other.pronouns],
        ]}
      />
      <SubSection title="Always answered by you">
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Questions in these categories are never filled automatically; a required one holds the job
          as Needs you.
        </Typography>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
          {s.alwaysUserOnly.map((category) => (
            <Chip key={category} label={category} size="small" variant="outlined" />
          ))}
        </Stack>
      </SubSection>
    </Section>
  );
}

/**
 * Settings (tickets 12 and 17, D20): the stored user document — profile, the
 * preferences rubric that drives matching (D6, D7, D8) and the application
 * settings that fill forms (D9) — loaded from `GET /api/me` and edited in
 * place. Save validates with the contract, then `PUT /api/me`; the next Run
 * reads the saved document. Résumé history and the always-user-only
 * categories (D10) stay read-only; empty settings resolve to user-only (D11).
 */
import { memo, useCallback, useState, type FormEvent, type ReactNode } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
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
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import type { User, UserProfile } from "@auto-apply/shared";
import { getMe, messageOf, updateMe } from "../api";
import { useLoad, type LoadState } from "../useLoad";
import {
  buildForm,
  initialValues,
  PRESET_LABELS,
  readForm,
  type Field,
  type RuleRow,
  type SettingsForm,
} from "./settingsForm";

export function SettingsPage() {
  const me = useLoad(getMe, "me");

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h1">Settings</Typography>
        <Typography color="text.secondary">
          The profile, preferences and settings each run reads. Saved changes apply from the next
          run.
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
  return <SettingsEditor initial={state.data} />;
}

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "invalid"; general: string[] }
  | { kind: "error"; message: string };

/** The form over the last saved user; a save replaces it with what the API stored. */
function SettingsEditor({ initial }: { initial: User }) {
  const [saved, setSaved] = useState(initial);
  const [form, setForm] = useState(() => buildForm(initial));
  const [values, setValues] = useState(() => initialValues(form));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [save, setSave] = useState<SaveState>({ kind: "idle" });

  const reset = (user: User) => {
    const next = buildForm(user);
    setSaved(user);
    setForm(next);
    setValues(initialValues(next));
    setErrors({});
  };

  // Stable, so a keystroke re-renders only the input it changed (FieldInput is memoised).
  const onChange = useCallback((key: string, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!(key in current)) return current;
      const { [key]: _fixed, ...rest } = current;
      return rest;
    });
    setSave((current) => (current.kind === "saved" ? { kind: "idle" } : current));
  }, []);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const read = readForm(saved, form, values);
    if (!read.ok) {
      setErrors(read.fields);
      setSave({ kind: "invalid", general: read.general });
      return;
    }
    setSave({ kind: "saving" });
    try {
      reset(await updateMe(read.request));
      setSave({ kind: "saved" });
    } catch (err) {
      setSave({ kind: "error", message: messageOf(err) });
    }
  };

  const input = (f: Field, inTable = false) => (
    <FieldInput
      key={f.key}
      field={f}
      value={values[f.key] ?? f.initial}
      error={errors[f.key]}
      inTable={inTable}
      onChange={onChange}
    />
  );

  return (
    <Box component="form" noValidate onSubmit={onSubmit} aria-label="Settings">
      <Stack spacing={3}>
        <ProfileSection form={form} profile={saved.profile} input={input} />
        <PreferencesSection form={form} saved={saved} input={input} />
        <ApplicationSettingsSection form={form} saved={saved} input={input} />
        <Card>
          <CardContent>
            <Stack spacing={2}>
              <SaveFeedback save={save} />
              <Stack direction="row" spacing={1}>
                <Button type="submit" variant="contained" disabled={save.kind === "saving"}>
                  {save.kind === "saving" ? "Saving…" : "Save changes"}
                </Button>
                <Button
                  variant="outlined"
                  disabled={save.kind === "saving"}
                  onClick={() => {
                    reset(saved);
                    setSave({ kind: "idle" });
                  }}
                >
                  Discard changes
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
}

function SaveFeedback({ save }: { save: SaveState }) {
  switch (save.kind) {
    case "saved":
      return <Alert severity="success">Saved. The next run uses these settings.</Alert>;
    case "invalid":
      return (
        <Alert severity="error">
          Not saved: fix the highlighted fields.
          {save.general.map((message) => (
            <Box key={message}>{message}</Box>
          ))}
        </Alert>
      );
    case "error":
      return <Alert severity="error">Could not save: {save.message}</Alert>;
    default:
      return null;
  }
}

/* ----------------------------- building blocks ----------------------------- */

type RenderInput = (field: Field, inTable?: boolean) => ReactNode;

const FieldInput = memo(function FieldInput({
  field,
  value,
  error,
  inTable,
  onChange,
}: {
  field: Field;
  value: string;
  error: string | undefined;
  inTable: boolean;
  onChange: (key: string, value: string) => void;
}) {
  const select = field.input === "yesNo" || field.input === "cap" || field.input === "preset";
  return (
    <TextField
      size="small"
      fullWidth
      label={inTable ? undefined : field.label}
      value={value}
      onChange={(event) => onChange(field.key, event.target.value)}
      error={error !== undefined}
      helperText={error ?? (inTable ? undefined : field.help)}
      multiline={field.input === "multiline"}
      minRows={field.input === "multiline" ? 3 : undefined}
      type={field.input === "number" ? "number" : field.input === "date" ? "date" : "text"}
      select={select}
      sx={field.input === "multiline" ? { gridColumn: "1 / -1" } : undefined}
      slotProps={{
        select: { native: true },
        inputLabel: select || field.input === "date" ? { shrink: true } : {},
        htmlInput: inTable ? { "aria-label": field.label } : {},
      }}
    >
      {field.input === "yesNo" && [
        <option key="" value="">
          Not set · you answer this
        </option>,
        <option key="yes" value="yes">
          Yes
        </option>,
        <option key="no" value="no">
          No
        </option>,
      ]}
      {field.input === "preset" &&
        Object.entries(PRESET_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      {field.input === "cap" && [
        <option key="APPLY" value="APPLY">
          APPLY
        </option>,
        <option key="STRETCH" value="STRETCH">
          STRETCH
        </option>,
      ]}
    </TextField>
  );
});

function FieldGrid({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
        gap: 2,
      }}
    >
      {children}
    </Box>
  );
}

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

function SubSection({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <Box>
      <Typography variant="h3" sx={{ mb: note ? 0.5 : 1 }}>
        {title}
      </Typography>
      {note && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {note}
        </Typography>
      )}
      {children}
    </Box>
  );
}

/** A plain MUI table: a header row and cells (text or inputs). */
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

/** An editable rubric table: the rule (with its source) then one input per field. */
function RuleTable({
  label,
  head,
  rows,
  input,
  missing = "—",
}: {
  label: string;
  head: string[];
  rows: RuleRow[];
  input: RenderInput;
  /** Shown for a column a row has no input for. */
  missing?: string;
}) {
  return (
    <SimpleTable
      label={label}
      head={head}
      rows={rows.map((row) => ({
        key: row.id,
        cells: [
          <Sourced key="label" label={row.label} source={row.source} />,
          ...head.slice(1).map((_, index) => {
            const f = row.fields[index];
            return f ? input(f, true) : missing;
          }),
        ],
      }))}
    />
  );
}

/* --------------------------------- sections -------------------------------- */

interface SectionProps {
  form: SettingsForm;
  saved: User;
  input: RenderInput;
}

function ProfileSection({
  form,
  profile,
  input,
}: {
  form: SettingsForm;
  profile: UserProfile;
  input: RenderInput;
}) {
  return (
    <Section title="Profile">
      <FieldGrid>{form.profile.map((f) => input(f))}</FieldGrid>
      <SubSection title="Experience" note="From the résumé; not editable here.">
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
      <SubSection title="Education" note="From the résumé; not editable here.">
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
      <SubSection title="Leadership" note="From the résumé; not editable here.">
        <Typography variant="body2">
          {profile.leadership.length === 0 ? "None" : profile.leadership.join(" · ")}
        </Typography>
      </SubSection>
    </Section>
  );
}

function PreferencesSection({ form, saved, input }: SectionProps) {
  const framing = saved.preferences.tierFraming;
  return (
    <Section title="Preferences">
      <SubSection
        title="Preferences preset"
        note="Demo turns the location hard block off; everything else is identical (other hard blocks, language gate, fit scoring)."
      >
        <Typography variant="body2" sx={{ mb: 1.5 }}>
          {`Active: ${PRESET_LABELS[saved.settings.preferencesPreset]}`}
        </Typography>
        <FieldGrid>{input(form.preset)}</FieldGrid>
      </SubSection>
      <FieldGrid>{form.preferences.map((f) => input(f))}</FieldGrid>
      <Typography variant="body2" color="text.secondary">
        Answer framing: {framing.manager} for manager titles, {framing.ic} for IC titles.
      </Typography>
      <SubSection
        title="Fit criteria"
        note="Weights add up to the fit score; negative weights are penalties."
      >
        <RuleTable
          label="Fit criteria"
          head={["Criterion", "Weight", "Keyword terms"]}
          rows={form.fitCriteria}
          input={input}
        />
      </SubSection>
      <SubSection
        title="Hard blocks"
        note="Checked in code before any AI call. The salary floor is set on the server, never stored."
      >
        <RuleTable
          label="Hard blocks"
          head={["Rule", "Terms", "Threshold"]}
          rows={form.hardBlocks}
          input={input}
          missing="Server setting"
        />
      </SubSection>
      <SubSection title="Blocked companies">
        <RuleTable
          label="Blocked companies"
          head={["Category", "Companies"]}
          rows={form.companyBlocks}
          input={input}
        />
      </SubSection>
      <SubSection title="Language gate">
        <RuleTable
          label="Language gate"
          head={["Rule", "Terms", "Verdict capped at"]}
          rows={form.languageGate}
          input={input}
        />
      </SubSection>
    </Section>
  );
}

function ApplicationSettingsSection({ form, saved, input }: SectionProps) {
  return (
    <Section title="Application settings">
      <Typography variant="body2" color="text.secondary">
        Empty answers are left for you: a required one holds the job as Needs you.
      </Typography>
      <FieldGrid>{form.settings.map((f) => input(f))}</FieldGrid>
      <SubSection
        title="Always answered by you"
        note="Questions in these categories are never filled automatically; a required one holds the job as Needs you."
      >
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
          {saved.settings.alwaysUserOnly.map((category) => (
            <Chip key={category} label={category} size="small" variant="outlined" />
          ))}
        </Stack>
      </SubSection>
    </Section>
  );
}

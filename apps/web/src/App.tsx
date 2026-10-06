/**
 * The themed shell and the routed views (D20). The router itself is provided
 * by the caller (`BrowserRouter` in `main.tsx`, `MemoryRouter` in tests).
 */
import { Navigate, Route, Routes } from "react-router-dom";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { theme } from "./theme";
import { AppShell } from "./shell/AppShell";
import { RunPanel } from "./run/RunPanel";
import { AppliedJobsPage } from "./pages/AppliedJobsPage";
import { ScannedJobsPage } from "./pages/ScannedJobsPage";
import { SettingsPage } from "./pages/SettingsPage";

export function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppShell>
        <Routes>
          <Route path="/" element={<RunPanel />} />
          <Route path="/applied" element={<AppliedJobsPage />} />
          <Route path="/scanned" element={<ScannedJobsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </ThemeProvider>
  );
}

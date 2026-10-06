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
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { ScannedJobsPage } from "./pages/ScannedJobsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { LoginPage } from "./pages/LoginPage";
import { AuthProvider } from "./auth/AuthProvider";
import { RequireAuth } from "./auth/RequireAuth";

/**
 * Login is the only page outside the gate (D26); every other path goes
 * through `RequireAuth` to the shell and its views.
 */
export function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<RequireAuth>{shell}</RequireAuth>} />
        </Routes>
      </AuthProvider>
    </ThemeProvider>
  );
}

const shell = (
  <AppShell>
    <Routes>
      <Route path="/" element={<RunPanel />} />
      <Route
        path="/applied"
        element={
          <PlaceholderPage
            title="Applied jobs"
            description="Each simulated submission and the payload built for it will be listed here."
          />
        }
      />
      <Route path="/scanned" element={<ScannedJobsPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </AppShell>
);

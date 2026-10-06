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

export function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
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
          <Route
            path="/scanned"
            element={
              <PlaceholderPage
                title="Scanned jobs"
                description="Every job evaluated across runs, with its verdict and reason, will be listed here."
              />
            }
          />
          <Route
            path="/settings"
            element={
              <PlaceholderPage
                title="Settings"
                description="The profile, preferences and settings that drive matching will be shown here."
              />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </ThemeProvider>
  );
}

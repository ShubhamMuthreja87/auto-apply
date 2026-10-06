/**
 * The frame around every view (ticket 05b): an app bar with the product name,
 * a Prototype badge and the nav tabs; a max-width content container; and a
 * quiet footer that says submissions are simulated (D18).
 */
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import { ApiHealth } from "./ApiHealth";
import { LogoutButton } from "./LogoutButton";

const navItems = [
  { path: "/", label: "Run" },
  { path: "/applied", label: "Applied jobs" },
  { path: "/scanned", label: "Scanned jobs" },
  { path: "/settings", label: "Settings" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const current = navItems.find((item) => item.path === pathname)?.path ?? false;

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <AppBar position="sticky">
        <Container maxWidth="lg">
          <Toolbar disableGutters sx={{ gap: 2, minHeight: { xs: 56 } }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexShrink: 0 }}>
              <AutoAwesomeIcon color="primary" fontSize="small" aria-hidden="true" />
              <Typography component="span" sx={{ fontWeight: 700 }}>
                AI Auto-apply
              </Typography>
              <Chip label="Prototype" size="small" variant="outlined" />
            </Stack>
            <Box sx={{ flex: 1 }} />
            <LogoutButton />
          </Toolbar>
          <Tabs
            value={current}
            aria-label="Views"
            variant="scrollable"
            scrollButtons={false}
            sx={{ minHeight: 40, mt: -1 }}
          >
            {navItems.map((item) => (
              <Tab
                key={item.path}
                label={item.label}
                value={item.path}
                component={Link}
                to={item.path}
                sx={{ minHeight: 40, px: 1.5 }}
              />
            ))}
          </Tabs>
        </Container>
      </AppBar>

      <Container component="main" maxWidth="lg" sx={{ flex: 1, py: 4 }}>
        {children}
      </Container>

      <Box component="footer" sx={{ borderTop: 1, borderColor: "divider", py: 2 }}>
        <Container maxWidth="lg">
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            sx={{ justifyContent: "space-between" }}
          >
            <Typography variant="caption" color="text.secondary">
              Submissions are simulated · payloads are built and stored, never sent
            </Typography>
            <ApiHealth />
          </Stack>
        </Container>
      </Box>
    </Box>
  );
}

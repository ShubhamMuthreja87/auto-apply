/**
 * The gate around the app shell (D26): nothing behind it renders until the
 * session is confirmed, and a signed-out browser goes to `/login`, which
 * sends it back to where it was after signing in.
 */
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import { useAuth } from "./AuthProvider";

/** Router state the login page reads to return the user to where they were. */
export interface LoginRedirectState {
  from: string;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, recheck } = useAuth();
  const location = useLocation();

  if (status.kind === "signedIn") return <>{children}</>;
  if (status.kind === "signedOut") {
    const state: LoginRedirectState = { from: `${location.pathname}${location.search}` };
    return <Navigate to="/login" replace state={state} />;
  }
  return (
    <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", px: 2 }}>
      {status.kind === "checking" ? (
        <CircularProgress aria-label="Checking your session" />
      ) : (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={recheck}>
              Retry
            </Button>
          }
        >
          Could not reach the API: {status.message}
        </Alert>
      )}
    </Box>
  );
}

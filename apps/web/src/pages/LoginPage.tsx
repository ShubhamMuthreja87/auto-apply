/**
 * The login page (D26): one user, no signup. On success the API sets the
 * httpOnly session cookie and the user returns to the page they asked for.
 */
import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import { ApiError, login, messageOf } from "../api";
import { useAuth } from "../auth/AuthProvider";
import type { LoginRedirectState } from "../auth/RequireAuth";

function returnPath(state: unknown): string {
  if (typeof state === "object" && state !== null && "from" in state) {
    const { from } = state as LoginRedirectState;
    // Only in-app paths, never an absolute URL.
    if (typeof from === "string" && from.startsWith("/") && !from.startsWith("//")) return from;
  }
  return "/";
}

function errorText(err: unknown): string {
  if (err instanceof ApiError && err.code === "invalid_credentials") {
    return "Wrong username or password.";
  }
  if (err instanceof ApiError && err.code === "rate_limited") {
    return "Too many attempts. Wait a few minutes and try again.";
  }
  return `Could not sign in: ${messageOf(err)}`;
}

export function LoginPage() {
  const { status, signedIn } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const target = returnPath(location.state);

  if (status.kind === "signedIn" && !submitting) return <Navigate to={target} replace />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login({ username, password });
      signedIn();
      navigate(target, { replace: true });
    } catch (err) {
      setError(errorText(err));
      setSubmitting(false);
    }
  }

  return (
    <Box
      component="main"
      sx={{ minHeight: "100vh", display: "grid", placeItems: "center", px: 2, py: 4 }}
    >
      <Card sx={{ width: "100%", maxWidth: 400 }}>
        <CardContent sx={{ p: 4 }}>
          <Stack spacing={3} component="form" onSubmit={onSubmit} noValidate>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <AutoAwesomeIcon color="primary" fontSize="small" aria-hidden="true" />
              <Typography component="span" sx={{ fontWeight: 700 }}>
                AI Auto-apply
              </Typography>
              <Chip label="Prototype" size="small" variant="outlined" />
            </Stack>
            <Typography variant="h1">Sign in</Typography>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              label="Username"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              autoFocus
            />
            <TextField
              label="Password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={submitting || username === "" || password === ""}
            >
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}

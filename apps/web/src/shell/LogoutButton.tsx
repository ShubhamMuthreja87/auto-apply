/**
 * Signs out (D26): the API clears the cookie and the gate sends the browser
 * to the login page. Signed out locally even if the call fails.
 */
import { useState } from "react";
import Button from "@mui/material/Button";
import LogoutIcon from "@mui/icons-material/Logout";
import { useAuth } from "../auth/AuthProvider";

export function LogoutButton() {
  const { signOut } = useAuth();
  const [busy, setBusy] = useState(false);

  return (
    <Button
      color="inherit"
      size="small"
      startIcon={<LogoutIcon fontSize="small" />}
      disabled={busy}
      onClick={() => {
        setBusy(true);
        signOut().catch(() => setBusy(false));
      }}
    >
      Log out
    </Button>
  );
}

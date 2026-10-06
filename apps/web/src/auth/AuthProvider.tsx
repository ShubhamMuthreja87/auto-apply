/**
 * Who is signed in (D26), as React state: checked once on load through
 * `GET /api/session`, set by the login page, and cleared by logout or by any
 * API call that answers `401`. The cookie itself is httpOnly; the browser
 * code never sees the token.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { getSession, logout, messageOf, onUnauthorized } from "../api";

export type AuthStatus =
  | { kind: "checking" }
  | { kind: "signedIn" }
  | { kind: "signedOut" }
  | { kind: "error"; message: string };

interface AuthContextValue {
  status: AuthStatus;
  /** The login page calls this once `POST /api/login` succeeded. */
  signedIn: () => void;
  signOut: () => Promise<void>;
  /** Re-runs the session check, after an error. */
  recheck: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>({ kind: "checking" });
  const [check, setCheck] = useState(0);

  useEffect(() => {
    let current = true;
    setStatus({ kind: "checking" });
    getSession()
      .then((ok) => {
        if (current) setStatus({ kind: ok ? "signedIn" : "signedOut" });
      })
      .catch((err: unknown) => {
        if (current) setStatus({ kind: "error", message: messageOf(err) });
      });
    return () => {
      current = false;
    };
  }, [check]);

  // Any 401 from the API means the session is gone or expired.
  useEffect(() => onUnauthorized(() => setStatus({ kind: "signedOut" })), []);

  const signedIn = useCallback(() => setStatus({ kind: "signedIn" }), []);
  const recheck = useCallback(() => setCheck((n) => n + 1), []);
  const signOut = useCallback(async () => {
    try {
      await logout();
    } finally {
      setStatus({ kind: "signedOut" });
    }
  }, []);

  const value = useMemo(
    () => ({ status, signedIn, signOut, recheck }),
    [status, signedIn, signOut, recheck],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>");
  return value;
}

/**
 * `requireAuth` (D26): every `/api/*` request but login, logout and health
 * must carry a valid session cookie. Mounted once on `/api` in `app.ts`, so
 * routes added later are covered without opting in. The SSE stream is a plain
 * GET, so it is checked here at connect; an open stream is not re-checked.
 */
import type { RequestHandler } from "express";
import { errorResponseSchema } from "@auto-apply/shared";
import { AUTH_COOKIE, verifySession } from "./session.js";

export function requireAuth(jwtSecret: string): RequestHandler {
  return (req, res, next) => {
    const cookies: unknown = req.cookies;
    const token =
      typeof cookies === "object" && cookies !== null && AUTH_COOKIE in cookies
        ? (cookies as Record<string, unknown>)[AUTH_COOKIE]
        : undefined;
    const uid = typeof token === "string" ? verifySession(jwtSecret, token) : null;
    if (uid === null) {
      res.status(401).json(
        errorResponseSchema.parse({
          error: { code: "unauthenticated", message: "Sign in to continue" },
        }),
      );
      return;
    }
    res.locals.uid = uid;
    next();
  };
}

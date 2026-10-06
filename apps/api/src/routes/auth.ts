/**
 * Login and logout (D26). Public by necessity; everything else under `/api`
 * sits behind `requireAuth`. One user, no signup: the uid in the session is
 * the fixed demo uid, never the username.
 */
import { Router, type RequestHandler } from "express";
import { errorResponseSchema, loginRequestSchema, sessionResponseSchema } from "@auto-apply/shared";
import { logger } from "../logger.js";
import { DEMO_UID } from "../user.js";
import {
  AUTH_COOKIE,
  checkCredentials,
  clearCookieOptions,
  sessionCookieOptions,
  signSession,
  type Credentials,
} from "../auth/session.js";

export interface AuthRouterOptions extends Credentials {
  jwtSecret: string;
  loginLimiter: RequestHandler;
}

export function authRouter(options: AuthRouterOptions): Router {
  const router = Router();

  router.post("/api/login", options.loginLimiter, async (req, res, next) => {
    const body = loginRequestSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json(
        errorResponseSchema.parse({
          error: { code: "invalid_request", message: "Username and password are required" },
        }),
      );
      return;
    }
    try {
      if (!(await checkCredentials(options, body.data))) {
        // The attempted username is never logged.
        logger.warn("login_failed", { ip: req.ip });
        res.status(401).json(
          errorResponseSchema.parse({
            error: { code: "invalid_credentials", message: "Wrong username or password" },
          }),
        );
        return;
      }
      res.cookie(AUTH_COOKIE, signSession(options.jwtSecret, DEMO_UID), sessionCookieOptions);
      res.json(sessionResponseSchema.parse({ authenticated: true }));
    } catch (err) {
      next(err);
    }
  });

  // Public, so an expired session can still clear its cookie.
  router.post("/api/logout", (_req, res) => {
    res.clearCookie(AUTH_COOKIE, clearCookieOptions);
    res.status(204).end();
  });

  return router;
}

/** `GET /api/session`: mounted behind `requireAuth`, so reaching it means signed in. */
export function sessionRouter(): Router {
  const router = Router();
  router.get("/api/session", (_req, res) => {
    res.json(sessionResponseSchema.parse({ authenticated: true }));
  });
  return router;
}

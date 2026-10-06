/**
 * The session (D26): one user, a bcrypt-checked password, and a minimal JWT
 * (`sub`, `iat`, `exp` and nothing else, so no PII) carried in an httpOnly
 * cookie. The same cookie authenticates the SSE stream.
 */
import { timingSafeEqual } from "node:crypto";
import type { CookieOptions } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import type { LoginRequest } from "@auto-apply/shared";

export const AUTH_COOKIE = "auth";
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

const ALGORITHM = "HS256";

/**
 * `Secure` everywhere: browsers accept Secure cookies on `http://localhost`,
 * so dev needs no exception. `Strict` is fine because the app and the API are
 * same-site in dev (localhost) and same-origin in production.
 */
const baseCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "strict",
  path: "/",
};

export const sessionCookieOptions: CookieOptions = {
  ...baseCookieOptions,
  maxAge: SESSION_TTL_SECONDS * 1000,
};

/** For `res.clearCookie`: the same attributes, or the browser keeps the cookie. */
export const clearCookieOptions: CookieOptions = baseCookieOptions;

export function signSession(secret: string, uid: string): string {
  return jwt.sign({}, secret, {
    subject: uid,
    expiresIn: SESSION_TTL_SECONDS,
    algorithm: ALGORITHM,
  });
}

const sessionPayloadSchema = z.object({ sub: z.string().min(1) });

/** The uid of a valid, unexpired token signed with `secret`; `null` otherwise. */
export function verifySession(secret: string, token: string): string | null {
  try {
    const payload = sessionPayloadSchema.safeParse(
      jwt.verify(token, secret, { algorithms: [ALGORITHM] }),
    );
    return payload.success ? payload.data.sub : null;
  } catch {
    // Bad signature, expired or malformed: all just "not signed in".
    return null;
  }
}

export interface Credentials {
  username: string;
  passwordHash: string;
}

/**
 * Whether `attempt` matches. The bcrypt comparison always runs, and the
 * username is compared in constant time, so the response time does not reveal
 * which half was wrong.
 */
export async function checkCredentials(
  credentials: Credentials,
  attempt: LoginRequest,
): Promise<boolean> {
  const passwordOk = await bcrypt.compare(attempt.password, credentials.passwordHash);
  return sameString(attempt.username, credentials.username) && passwordOk;
}

function sameString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Test support, not shipped code (excluded from the build): auth env vars and
 * a session cookie for tests that drive the protected API. The password hash
 * and the JWT secret are generated per test run; nothing real is committed.
 */
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { AUTH_COOKIE, signSession } from "./session.js";
import { DEMO_UID } from "../user.js";

export const TEST_USERNAME = "jobseeker";
export const TEST_PASSWORD = randomBytes(12).toString("hex");

/** Spread into `loadConfig({...})`; cost 12, as in production (D26). */
export const TEST_AUTH_ENV = {
  AUTH_USERNAME: TEST_USERNAME,
  AUTH_PASSWORD_HASH: bcrypt.hashSync(TEST_PASSWORD, 12),
  JWT_SECRET: randomBytes(32).toString("hex"),
} as const;

/** A `Cookie` header value carrying a valid session for the demo user. */
export function authCookie(jwtSecret: string = TEST_AUTH_ENV.JWT_SECRET): string {
  return `${AUTH_COOKIE}=${signSession(jwtSecret, DEMO_UID)}`;
}

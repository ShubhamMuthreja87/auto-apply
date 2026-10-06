/**
 * The auth environment variables (D26), merged into the API's one env schema in
 * `config.ts` so they are parsed once at startup and the boot fails fast when
 * one is missing. No defaults: a server without them must not start.
 */
import { z } from "zod";

/** A bcrypt hash (`$2a$` / `$2b$` / `$2y$`) with a cost of at least 12 (D26). */
const BCRYPT_COST_12_OR_MORE = /^\$2[aby]\$(1[2-9]|[23]\d)\$[./A-Za-z0-9]{53}$/;

export const authEnvSchema = z.object({
  /** The one user's login name. There is no signup. */
  AUTH_USERNAME: z.string().trim().min(1),
  /** bcrypt hash of the password; `npm -w @auto-apply/api run hash-password` makes one. */
  AUTH_PASSWORD_HASH: z
    .string()
    .trim()
    .regex(BCRYPT_COST_12_OR_MORE, "must be a bcrypt hash with cost 12 or more"),
  /** HMAC key for the session JWT; long and random (`openssl rand -hex 32`). */
  JWT_SECRET: z.string().min(32, "must be at least 32 characters"),
});

export const AUTH_ENV_KEYS = ["AUTH_USERNAME", "AUTH_PASSWORD_HASH", "JWT_SECRET"] as const;

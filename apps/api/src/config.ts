import { z } from "zod";
import { repoKindSchema } from "@auto-apply/shared";
import { aiEnvSchema } from "./ai/ai-env.js";
import { authEnvSchema } from "./auth/auth-env.js";

/** An env var that may be absent or blank; blank counts as unset. */
const optionalString = z
  .string()
  .optional()
  .transform((value) => (value ? value : undefined));

const DEV_CORS_ORIGIN = "http://localhost:5173";

/**
 * Environment is parsed once, at startup, and the process fails fast if it is
 * invalid (CODING_STANDARDS, General). The AI vars come from `ai/ai-env.ts`,
 * the auth vars (required, no defaults) from `auth/auth-env.ts`.
 */
const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3001),
    // One Firestore path segment: the namespace root document is `ns/{namespace}`
    // (ADR-0001), so a slash or a reserved `__x__` id would escape it.
    FIRESTORE_NAMESPACE: z
      .string()
      .regex(/^[A-Za-z0-9-]+$/, "must be letters, digits and dashes only")
      .default("dev"),
    // Firestore unless the in-memory twin is asked for explicitly (ADR-0004).
    REPO: repoKindSchema.default("firestore"),
    // Exactly one browser origin, with credentials, never `*` (D27). Same
    // origin in production, where it must be set (see `loadConfig`); the Vite
    // dev server by default in development and test.
    CORS_ORIGIN: optionalString.pipe(z.string().url().default(DEV_CORS_ORIGIN)),
    // Read by `loadCredential`; inline JSON wins over the key-file path.
    FIREBASE_SERVICE_ACCOUNT_JSON: optionalString,
    GOOGLE_APPLICATION_CREDENTIALS: optionalString,
    // `live` reads the public ATS boards (D2) with a per-board fixture fallback
    // (D3); `fixtures` reads only the recorded boards, never the network, for
    // deterministic end-to-end runs (spec, Testing seam 6).
    JOB_SOURCE: z.enum(["live", "fixtures"]).default("live"),
    // The salary hard block's floor, in lakhs per annum. Kept out of the user
    // document (compensation is never seeded); unset means the block is inactive.
    SALARY_FLOOR_LPA: optionalString.pipe(z.coerce.number().positive().optional()),
  })
  .merge(aiEnvSchema)
  .merge(authEnvSchema);

export type Config = z.infer<typeof envSchema>;

/** Every variable the server reads; `apps/api/.env.example` documents each one. */
export const CONFIG_KEYS = Object.keys(envSchema.shape) as (keyof Config)[];

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // Only the schema's own keys are read, never the whole environment.
  const config = envSchema.parse(Object.fromEntries(CONFIG_KEYS.map((key) => [key, env[key]])));

  // The `prod` namespace is only ever used on the server (CODING_STANDARDS,
  // Namespace isolation).
  if (config.FIRESTORE_NAMESPACE === "prod" && config.NODE_ENV !== "production") {
    throw new Error("Refusing to start: FIRESTORE_NAMESPACE=prod requires NODE_ENV=production");
  }

  // In-memory data dies with the process; never in production (ADR-0004).
  if (config.REPO === "memory" && config.NODE_ENV === "production") {
    throw new Error("Refusing to start: REPO=memory is not allowed with NODE_ENV=production");
  }

  // Production never falls back to the dev origin: a forgotten CORS_ORIGIN
  // fails here instead of silently allowing http://localhost:5173 (D27).
  if (config.NODE_ENV === "production" && !env.CORS_ORIGIN) {
    throw new Error(
      "Refusing to start: CORS_ORIGIN must be set explicitly when NODE_ENV=production (e.g. https://<domain>)",
    );
  }

  return config;
}

import { z } from "zod";
import { repoKindSchema } from "@auto-apply/shared";

/** An env var that may be absent or blank; blank counts as unset. */
const optionalString = z
  .string()
  .optional()
  .transform((value) => (value ? value : undefined));

/**
 * Environment is parsed once, at startup, and the process fails fast if it is
 * invalid (CODING_STANDARDS, General). Later tickets add the auth and AI
 * vars.
 */
const envSchema = z.object({
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
  // origin in production; the Vite dev server locally.
  CORS_ORIGIN: z.string().url().default("http://localhost:5173"),
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
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const config = envSchema.parse({
    NODE_ENV: env.NODE_ENV,
    PORT: env.PORT,
    FIRESTORE_NAMESPACE: env.FIRESTORE_NAMESPACE,
    REPO: env.REPO,
    CORS_ORIGIN: env.CORS_ORIGIN,
    FIREBASE_SERVICE_ACCOUNT_JSON: env.FIREBASE_SERVICE_ACCOUNT_JSON,
    GOOGLE_APPLICATION_CREDENTIALS: env.GOOGLE_APPLICATION_CREDENTIALS,
    JOB_SOURCE: env.JOB_SOURCE,
    SALARY_FLOOR_LPA: env.SALARY_FLOOR_LPA,
  });

  // The `prod` namespace is only ever used on the server (CODING_STANDARDS,
  // Namespace isolation).
  if (config.FIRESTORE_NAMESPACE === "prod" && config.NODE_ENV !== "production") {
    throw new Error("Refusing to start: FIRESTORE_NAMESPACE=prod requires NODE_ENV=production");
  }

  // In-memory data dies with the process; never in production (ADR-0004).
  if (config.REPO === "memory" && config.NODE_ENV === "production") {
    throw new Error("Refusing to start: REPO=memory is not allowed with NODE_ENV=production");
  }

  return config;
}

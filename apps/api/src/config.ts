import { z } from "zod";

/** An env var that may be absent or blank; blank counts as unset. */
const optionalString = z
  .string()
  .optional()
  .transform((value) => (value ? value : undefined));

/**
 * Environment is parsed once, at startup, and the process fails fast if it is
 * invalid (CODING_STANDARDS, General). Later tickets add the auth, CORS and AI
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
  // Read by `loadCredential`; inline JSON wins over the key-file path.
  FIREBASE_SERVICE_ACCOUNT_JSON: optionalString,
  GOOGLE_APPLICATION_CREDENTIALS: optionalString,
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const config = envSchema.parse({
    NODE_ENV: env.NODE_ENV,
    PORT: env.PORT,
    FIRESTORE_NAMESPACE: env.FIRESTORE_NAMESPACE,
    FIREBASE_SERVICE_ACCOUNT_JSON: env.FIREBASE_SERVICE_ACCOUNT_JSON,
    GOOGLE_APPLICATION_CREDENTIALS: env.GOOGLE_APPLICATION_CREDENTIALS,
  });

  // The `prod` namespace is only ever used on the server (CODING_STANDARDS,
  // Namespace isolation).
  if (config.FIRESTORE_NAMESPACE === "prod" && config.NODE_ENV !== "production") {
    throw new Error("Refusing to start: FIRESTORE_NAMESPACE=prod requires NODE_ENV=production");
  }

  return config;
}

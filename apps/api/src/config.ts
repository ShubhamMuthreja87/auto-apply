import { z } from "zod";

/**
 * Environment is parsed once, at startup, and the process fails fast if it is
 * invalid (CODING_STANDARDS, General). Later tickets add the Firebase, auth,
 * CORS and AI vars; this skeleton only needs enough to boot and serve health.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  FIRESTORE_NAMESPACE: z.string().min(1).default("dev"),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const config = envSchema.parse({
    NODE_ENV: env.NODE_ENV,
    PORT: env.PORT,
    FIRESTORE_NAMESPACE: env.FIRESTORE_NAMESPACE,
  });

  // The `prod` namespace is only ever used on the server (CODING_STANDARDS,
  // Namespace isolation).
  if (config.FIRESTORE_NAMESPACE === "prod" && config.NODE_ENV !== "production") {
    throw new Error("Refusing to start: FIRESTORE_NAMESPACE=prod requires NODE_ENV=production");
  }

  return config;
}

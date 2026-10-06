/**
 * The AI environment variables (D22), merged into the API's one env schema in
 * `config.ts` so they are parsed once at startup. Defaults point at DeepSeek;
 * any OpenAI-compatible provider works by changing them. No `AI_API_KEY`
 * means the whole Run uses fallback scoring (D24).
 */
import { z } from "zod";

/** An env var that may be absent or blank; blank counts as unset. */
const optionalSecret = z
  .string()
  .optional()
  .transform((value) => (value?.trim() ? value.trim() : undefined));

export const aiEnvSchema = z.object({
  /** A label for logs and the UI only; the base URL decides who is called. */
  AI_PROVIDER: z.string().min(1).default("deepseek"),
  AI_BASE_URL: z.string().url().default("https://api.deepseek.com"),
  AI_MODEL: z.string().min(1).default("deepseek-chat"),
  AI_API_KEY: optionalSecret,
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
});

export const AI_ENV_KEYS = [
  "AI_PROVIDER",
  "AI_BASE_URL",
  "AI_MODEL",
  "AI_API_KEY",
  "AI_TIMEOUT_MS",
] as const;

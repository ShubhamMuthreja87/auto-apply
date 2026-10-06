import { readFileSync } from "node:fs";
import { z } from "zod";

/**
 * The service-account fields the Admin SDK needs, in the camelCase shape
 * `cert()` takes. Everything else in the key file is ignored.
 */
export interface ServiceAccountCredential {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

const serviceAccountKeySchema = z.object({
  type: z.literal("service_account"),
  project_id: z.string().min(1),
  client_email: z.string().email(),
  private_key: z.string().min(1),
});

type CredentialEnv = Partial<
  Record<"FIREBASE_SERVICE_ACCOUNT_JSON" | "GOOGLE_APPLICATION_CREDENTIALS", string>
>;

/**
 * Loads the Firebase service account once, at boot (CLAUDE.md, Firestore).
 * `FIREBASE_SERVICE_ACCOUNT_JSON` wins — raw JSON, or base64 of it — otherwise
 * `GOOGLE_APPLICATION_CREDENTIALS` names the key file. Returns `null` when
 * neither is set; throws on anything malformed so a bad key fails the boot,
 * not the first Firestore call. Errors name the source, never the key itself.
 */
export function loadCredential(env: CredentialEnv): ServiceAccountCredential | null {
  const inline = env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (inline) return validate(parseInline(inline), "FIREBASE_SERVICE_ACCOUNT_JSON");

  const file = env.GOOGLE_APPLICATION_CREDENTIALS;
  if (file) return validate(parseFile(file), "GOOGLE_APPLICATION_CREDENTIALS");

  return null;
}

function parseInline(value: string): unknown {
  const decoded = Buffer.from(value, "base64").toString("utf8");
  for (const candidate of [value, decoded]) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Not this encoding; try the next one.
    }
  }
  throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is neither JSON nor base64-encoded JSON");
}

function parseFile(file: string): unknown {
  let contents: string;
  try {
    contents = readFileSync(file, "utf8");
  } catch (err) {
    const code = err instanceof Error && "code" in err ? String(err.code) : "unknown";
    throw new Error(`GOOGLE_APPLICATION_CREDENTIALS: cannot read ${file} (${code})`);
  }
  try {
    return JSON.parse(contents);
  } catch {
    throw new Error(`GOOGLE_APPLICATION_CREDENTIALS: ${file} is not valid JSON`);
  }
}

function validate(raw: unknown, source: string): ServiceAccountCredential {
  const parsed = serviceAccountKeySchema.safeParse(raw);
  if (!parsed.success) {
    // Paths and messages only: zod issues never include the offending value.
    const problems = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`${source} is not a service-account key (${problems})`);
  }
  return {
    projectId: parsed.data.project_id,
    clientEmail: parsed.data.client_email,
    privateKey: parsed.data.private_key,
  };
}

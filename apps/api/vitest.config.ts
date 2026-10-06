import { defineConfig } from "vitest/config";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

// The Firestore integration suite runs when credentials are present. Take only
// the two credential vars from `apps/api/.env` (if any) — never its namespace,
// which tests always replace with a disposable `test-*` one. Values already in
// the shell environment win.
const envFile = path.join(import.meta.dirname, ".env");
const dotenv = existsSync(envFile) ? parseEnv(readFileSync(envFile, "utf8")) : {};
const credentialEnv = Object.fromEntries(
  (["FIREBASE_SERVICE_ACCOUNT_JSON", "GOOGLE_APPLICATION_CREDENTIALS"] as const)
    .map((name) => [name, process.env[name] ?? dotenv[name]])
    .filter((entry): entry is [string, string] => Boolean(entry[1])),
);

export default defineConfig({
  resolve: {
    alias: {
      "@auto-apply/shared": path.resolve(import.meta.dirname, "../../packages/shared/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    env: credentialEnv,
  },
});

/**
 * The one end-to-end happy path (ticket 16), in deterministic mode: recorded
 * job boards only (`JOB_SOURCE=fixtures`, no network), the in-memory store
 * (`REPO=memory`), and no AI key, so every job is scored by the keyword
 * fallback matcher (D24). Not part of `npm run verify`; run it with
 * `npm run test:e2e`.
 *
 * The app runs as in dev: the API from source on :3001 and the Vite dev
 * server on :5173, whose proxy forwards `/api` (the SSE stream included) the
 * way nginx does in production. Same origin, so the `Secure` session cookie
 * works on http://localhost without weakening it.
 */
import { randomBytes } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";
import bcrypt from "bcryptjs";
import { E2E_PASSWORD, E2E_USERNAME } from "./e2e/credentials";

const WEB_URL = "http://localhost:5173";

const apiEnv: Record<string, string> = {
  NODE_ENV: "test",
  PORT: "3001",
  // In-memory anyway; a test-* namespace keeps it out of dev and prod.
  FIRESTORE_NAMESPACE: "test-e2e",
  REPO: "memory",
  JOB_SOURCE: "fixtures",
  // Explicitly empty: a key exported in the shell must not reach the API.
  AI_API_KEY: "",
  FIREBASE_SERVICE_ACCOUNT_JSON: "",
  GOOGLE_APPLICATION_CREDENTIALS: "",
  SALARY_FLOOR_LPA: "",
  CORS_ORIGIN: WEB_URL,
  AUTH_USERNAME: E2E_USERNAME,
  AUTH_PASSWORD_HASH: bcrypt.hashSync(E2E_PASSWORD, 12),
  // Only the API process uses it, so a fresh random one per run is fine.
  JWT_SECRET: randomBytes(32).toString("hex"),
};

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
  timeout: 120_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: WEB_URL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // A preinstalled Chromium whose build differs from the one this
        // @playwright/test pins (e.g. in a cloud session) can be named here.
        launchOptions: process.env.E2E_CHROMIUM_PATH
          ? { executablePath: process.env.E2E_CHROMIUM_PATH }
          : {},
      },
    },
  ],
  webServer: [
    {
      // From source and without `--env-file`: a developer's apps/api/.env
      // must not leak a real namespace, credential or AI key into this run.
      command: "npx tsx src/index.ts",
      cwd: "apps/api",
      url: "http://localhost:3001/api/health",
      env: apiEnv,
      // Never attach to a server already on the port: it would not be in
      // deterministic mode. A busy port fails the run instead.
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      command: "npm -w @auto-apply/web run dev -- --strictPort",
      url: WEB_URL,
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
});

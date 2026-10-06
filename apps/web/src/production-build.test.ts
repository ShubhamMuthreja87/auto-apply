// @vitest-environment node
/**
 * The production web build talks to the API only through its own origin. A
 * `localhost` URL baked into the bundle is what broke the deployed https site
 * (mixed content), so this builds the app exactly as `npm run build` does,
 * into a throwaway directory, and reads every emitted file.
 */
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "vite";

const webRoot = path.resolve(import.meta.dirname, "..");

/**
 * The one exemption: react-router parses paths against the exact string
 * literal `"http://localhost"` as a dummy URL base and never requests it. Only
 * that whole literal is exempt, so `"http://localhost:3001"` or any other
 * mention still fails the check.
 */
const ROUTER_URL_BASE = /(["'`])http:\/\/localhost\1/g;
let outDir: string;

beforeAll(async () => {
  outDir = await mkdtemp(path.join(tmpdir(), "auto-apply-web-build-"));
  await build({
    root: webRoot,
    configFile: path.join(webRoot, "vite.config.ts"),
    mode: "production",
    logLevel: "silent",
    build: { outDir, emptyOutDir: true },
  });
}, 120_000);

afterAll(async () => {
  if (outDir) await rm(outDir, { recursive: true, force: true });
});

async function emittedFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name));
}

describe("production web build", () => {
  it("emits the app shell and its scripts", async () => {
    const files = await emittedFiles(outDir);
    expect(files.map((file) => path.relative(outDir, file))).toContain("index.html");
    expect(files.some((file) => file.endsWith(".js"))).toBe(true);
  });

  it('contains no "localhost" anywhere, so every API call stays same-origin', async () => {
    const offenders: string[] = [];
    for (const file of await emittedFiles(outDir)) {
      const text = (await readFile(file, "latin1")).replace(ROUTER_URL_BASE, "");
      if (text.includes("localhost")) offenders.push(path.relative(outDir, file));
    }
    expect(offenders).toEqual([]);
  });
});

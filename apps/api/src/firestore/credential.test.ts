import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { loadCredential } from "./credential.js";

const key = {
  type: "service_account",
  project_id: "auto-apply-test",
  private_key_id: "abc123",
  private_key: "-----BEGIN PRIVATE KEY-----\nMIIfake\n-----END PRIVATE KEY-----\n",
  client_email: "api@auto-apply-test.iam.gserviceaccount.com",
  client_id: "1234567890",
};

const expected = {
  projectId: "auto-apply-test",
  clientEmail: "api@auto-apply-test.iam.gserviceaccount.com",
  privateKey: key.private_key,
};

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function keyFile(contents: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "auto-apply-cred-"));
  tempDirs.push(dir);
  const file = path.join(dir, "key.json");
  writeFileSync(file, contents);
  return file;
}

describe("loadCredential", () => {
  it("returns null when no credential is configured", () => {
    expect(loadCredential({})).toBeNull();
  });

  it("parses FIREBASE_SERVICE_ACCOUNT_JSON given as raw JSON", () => {
    expect(loadCredential({ FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify(key) })).toEqual(
      expected,
    );
  });

  it("falls back to base64-decoding FIREBASE_SERVICE_ACCOUNT_JSON", () => {
    const encoded = Buffer.from(JSON.stringify(key)).toString("base64");
    expect(loadCredential({ FIREBASE_SERVICE_ACCOUNT_JSON: encoded })).toEqual(expected);
  });

  it("reads the key file named by GOOGLE_APPLICATION_CREDENTIALS", () => {
    const file = keyFile(JSON.stringify(key));
    expect(loadCredential({ GOOGLE_APPLICATION_CREDENTIALS: file })).toEqual(expected);
  });

  it("prefers FIREBASE_SERVICE_ACCOUNT_JSON over GOOGLE_APPLICATION_CREDENTIALS", () => {
    const file = keyFile(JSON.stringify({ ...key, project_id: "from-file" }));
    const credential = loadCredential({
      FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify(key),
      GOOGLE_APPLICATION_CREDENTIALS: file,
    });
    expect(credential?.projectId).toBe("auto-apply-test");
  });

  it("fails fast on a value that is neither JSON nor base64 JSON", () => {
    expect(() => loadCredential({ FIREBASE_SERVICE_ACCOUNT_JSON: "not a key" })).toThrow(
      /FIREBASE_SERVICE_ACCOUNT_JSON/,
    );
  });

  it("fails fast on JSON that is not a service-account key", () => {
    const { private_key: _omitted, ...incomplete } = key;
    expect(() =>
      loadCredential({ FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify(incomplete) }),
    ).toThrow(/private_key/);
  });

  it("fails fast when the key file does not exist", () => {
    expect(() =>
      loadCredential({ GOOGLE_APPLICATION_CREDENTIALS: "/nonexistent/auto-apply-key.json" }),
    ).toThrow(/GOOGLE_APPLICATION_CREDENTIALS/);
  });

  it("never echoes the private key in an error message", () => {
    const broken = JSON.stringify({ ...key, client_email: 42 });
    expect(() => loadCredential({ FIREBASE_SERVICE_ACCOUNT_JSON: broken })).toThrow(
      expect.not.objectContaining({ message: expect.stringContaining("MIIfake") }),
    );
  });
});

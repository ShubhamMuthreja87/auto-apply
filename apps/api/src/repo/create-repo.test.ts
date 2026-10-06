import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../config.js";
import { createRepo } from "./create-repo.js";
import { FirestoreRepo } from "./firestore-repo.js";
import { InMemoryRepo } from "./in-memory-repo.js";

const key = JSON.stringify({
  type: "service_account",
  project_id: "auto-apply-test",
  // A throwaway key: `cert()` parses it at boot, but nothing here goes online.
  private_key: generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({
    type: "pkcs8",
    format: "pem",
  }),
  client_email: "api@auto-apply-test.iam.gserviceaccount.com",
});

describe("createRepo (ADR-0004: no silent fallback)", () => {
  it("refuses to start without a credential when REPO is not set", () => {
    expect(() => createRepo(loadConfig({ NODE_ENV: "development" }))).toThrow(
      /credential.*REPO=memory/is,
    );
  });

  it("refuses to start in production without a credential", () => {
    expect(() =>
      createRepo(loadConfig({ NODE_ENV: "production", FIRESTORE_NAMESPACE: "prod" })),
    ).toThrow(/credential/i);
  });

  it("uses the in-memory repo only when REPO=memory is set explicitly", async () => {
    const persistence = createRepo(loadConfig({ NODE_ENV: "development", REPO: "memory" }));
    expect(persistence.kind).toBe("memory");
    expect(persistence.repo).toBeInstanceOf(InMemoryRepo);
    await persistence.close();
  });

  it("honours REPO=memory even when a credential is configured", async () => {
    const persistence = createRepo(
      loadConfig({ NODE_ENV: "development", REPO: "memory", FIREBASE_SERVICE_ACCOUNT_JSON: key }),
    );
    expect(persistence.kind).toBe("memory");
    await persistence.close();
  });

  it("fails fast on a malformed credential", () => {
    expect(() =>
      createRepo(loadConfig({ NODE_ENV: "development", FIREBASE_SERVICE_ACCOUNT_JSON: "{}" })),
    ).toThrow(/FIREBASE_SERVICE_ACCOUNT_JSON/);
  });

  it("uses Firestore when a valid credential is configured", async () => {
    const persistence = createRepo(
      loadConfig({ NODE_ENV: "development", FIREBASE_SERVICE_ACCOUNT_JSON: key }),
      "create-repo-test",
    );
    expect(persistence.kind).toBe("firestore");
    expect(persistence.repo).toBeInstanceOf(FirestoreRepo);
    await persistence.close();
  });
});

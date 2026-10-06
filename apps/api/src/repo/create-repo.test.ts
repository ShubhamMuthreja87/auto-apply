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

describe("createRepo", () => {
  it("uses the in-memory repo in development when no credential is configured", async () => {
    const persistence = createRepo(loadConfig({ NODE_ENV: "development" }));
    expect(persistence.kind).toBe("memory");
    expect(persistence.repo).toBeInstanceOf(InMemoryRepo);
    await persistence.close();
  });

  it("refuses to start in production without a credential", () => {
    expect(() =>
      createRepo(loadConfig({ NODE_ENV: "production", FIRESTORE_NAMESPACE: "prod" })),
    ).toThrow(/credential/i);
  });

  it("fails fast on a malformed credential instead of falling back to memory", () => {
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

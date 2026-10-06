import type { Repo, RepoKind } from "@auto-apply/shared";
import type { Config } from "../config.js";
import { loadCredential } from "../firestore/credential.js";
import { openFirestore } from "../firestore/firestore.js";
import { FirestoreRepo } from "./firestore-repo.js";
import { InMemoryRepo } from "./in-memory-repo.js";

export interface Persistence {
  repo: Repo;
  kind: RepoKind;
  close: () => Promise<void>;
}

/**
 * Chooses the `Repo` at boot, with no silent fallback (ADR-0004): the
 * in-memory twin only when `REPO=memory` is set (config already refuses that
 * in production); otherwise Firestore, which needs a valid credential — a
 * missing or malformed one stops the boot.
 */
export function createRepo(config: Config, appName?: string): Persistence {
  if (config.REPO === "memory") {
    return { repo: new InMemoryRepo(), kind: "memory", close: async () => {} };
  }
  const credential = loadCredential(config);
  if (!credential) {
    throw new Error(
      "Refusing to start: no Firestore credential (set GOOGLE_APPLICATION_CREDENTIALS or " +
        "FIREBASE_SERVICE_ACCOUNT_JSON), or set REPO=memory for a non-persistent dev store",
    );
  }
  const handle = openFirestore(credential, appName);
  return {
    repo: new FirestoreRepo(handle.db, config.FIRESTORE_NAMESPACE),
    kind: "firestore",
    close: handle.close,
  };
}

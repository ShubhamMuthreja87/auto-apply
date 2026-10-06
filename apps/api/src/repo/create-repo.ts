import type { Repo } from "@auto-apply/shared";
import type { Config } from "../config.js";
import { loadCredential } from "../firestore/credential.js";
import { openFirestore } from "../firestore/firestore.js";
import { FirestoreRepo } from "./firestore-repo.js";
import { InMemoryRepo } from "./in-memory-repo.js";

export interface Persistence {
  repo: Repo;
  kind: "firestore" | "memory";
  close: () => Promise<void>;
}

/**
 * Chooses the `Repo` at boot. A configured credential is validated now (a bad
 * key fails the boot) and selects Firestore in the configured namespace.
 * Without one, development falls back to the in-memory twin; production
 * refuses to start rather than silently losing data.
 */
export function createRepo(config: Config, appName?: string): Persistence {
  const credential = loadCredential(config);
  if (credential) {
    const handle = openFirestore(credential, appName);
    return {
      repo: new FirestoreRepo(handle.db, config.FIRESTORE_NAMESPACE),
      kind: "firestore",
      close: handle.close,
    };
  }
  if (config.NODE_ENV === "production") {
    throw new Error(
      "Refusing to start: production needs a Firestore credential " +
        "(GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT_JSON)",
    );
  }
  return { repo: new InMemoryRepo(), kind: "memory", close: async () => {} };
}

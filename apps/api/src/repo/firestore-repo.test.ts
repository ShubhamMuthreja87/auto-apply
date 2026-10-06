/**
 * The Firestore integration suite: the shared `Repo` contract against the real
 * project, in a namespace unique to this test run (`test-<random>`) that is
 * deleted with `recursiveDelete(nsDoc())` afterwards. Skipped cleanly when no
 * credentials are configured (CLAUDE.md, Tests); `vitest.config.ts` picks the
 * credential vars up from `apps/api/.env` when present.
 */
import { randomBytes } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { emptyFunnel } from "@auto-apply/shared";
import { loadCredential } from "../firestore/credential.js";
import { nsDoc, openFirestore, type FirestoreHandle } from "../firestore/firestore.js";
import { FirestoreRepo } from "./firestore-repo.js";
import { describeRepoContract } from "./repo-contract.js";

const credential = loadCredential(process.env);
const namespace = `test-${randomBytes(6).toString("hex")}`;

let handle: FirestoreHandle | undefined;
function firestore(): FirestoreHandle {
  if (!credential) throw new Error("unreachable: suite is skipped without credentials");
  handle ??= openFirestore(credential, `contract-${namespace}`);
  return handle;
}

describe.skipIf(!credential)(`FirestoreRepo (namespace ${namespace})`, () => {
  afterAll(async () => {
    if (!handle) return;
    await handle.db.recursiveDelete(nsDoc(handle.db, namespace));
    await handle.close();
  });

  describeRepoContract(
    "FirestoreRepo",
    () => {
      const { db } = firestore();
      return {
        repo: new FirestoreRepo(db, namespace),
        // Each test starts from an empty namespace.
        teardown: () => db.recursiveDelete(nsDoc(db, namespace)),
      };
    },
    { testTimeoutMs: 30_000, quietMs: 1_500, deliveryTimeoutMs: 10_000 },
  );

  it(
    "hangs every collection off the namespace root document (ADR-0001)",
    { timeout: 30_000 },
    async () => {
      const { db } = firestore();
      const repo = new FirestoreRepo(db, namespace);
      const now = new Date().toISOString();
      await repo.seedUserIfMissing("user-1", {
        uid: "user-1",
        profile: {},
        preferences: {},
        settings: {},
      });
      await repo.createRun({
        runId: "run-1",
        uid: "user-1",
        status: "discovering",
        funnel: emptyFunnel(),
        reason: null,
        createdAt: now,
        updatedAt: now,
      });
      await repo.markSeen("greenhouse:acme:1");

      const root = `ns/${namespace}`;
      expect((await db.doc(`${root}/users/user-1`).get()).exists).toBe(true);
      expect((await db.doc(`${root}/runs/run-1`).get()).exists).toBe(true);
      expect((await db.doc(`${root}/seen/greenhouse:acme:1`).get()).exists).toBe(true);
      // Nothing leaks to top-level collections.
      expect((await db.doc("runs/run-1").get()).exists).toBe(false);

      await db.recursiveDelete(nsDoc(db, namespace));
    },
  );
});

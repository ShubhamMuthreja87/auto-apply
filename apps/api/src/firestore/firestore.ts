import { cert, deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import type { ServiceAccountCredential } from "./credential.js";

export interface FirestoreHandle {
  db: Firestore;
  /** Releases the Admin SDK app and its connections (tests, shutdown). */
  close: () => Promise<void>;
}

/**
 * Opens Firestore through the Admin SDK — the only Firestore access in the
 * system; browsers have none (`firestore.rules`). `appName` lets tests open
 * their own app beside the default one.
 */
export function openFirestore(
  credential: ServiceAccountCredential,
  appName?: string,
): FirestoreHandle {
  const app = initializeApp(
    { credential: cert(credential), projectId: credential.projectId },
    appName,
  );
  const db = getFirestore(app);
  db.settings({ ignoreUndefinedProperties: true });
  return { db, close: () => deleteApp(app) };
}

/**
 * The namespace root document `ns/{namespace}` (ADR-0001). Every collection —
 * `runs`, `runs/{runId}/jobs`, `seen`, `users` — hangs off it, so a namespace
 * is one subtree that `recursiveDelete(nsDoc(...))` removes whole, and no query
 * can span namespaces.
 */
export function nsDoc(db: Firestore, namespace: string): DocumentReference {
  return db.doc(`ns/${namespace}`);
}

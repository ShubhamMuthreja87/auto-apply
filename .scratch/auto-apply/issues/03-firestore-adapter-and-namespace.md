# 03: Firestore adapter + credentials + namespace isolation

**What to build:** The real Firestore implementation of `Repo`, credential loading, and namespace isolation — proven by passing the same contract suite from ticket 02 against the live project.

**Blocked by:** 02.

**Status:** done

- [x] `loadCredential()`: `FIREBASE_SERVICE_ACCOUNT_JSON` wins — `JSON.parse`, and on failure base64-decode then parse; otherwise `GOOGLE_APPLICATION_CREDENTIALS` (file path). The parsed service account is zod-validated at boot.
- [x] `nsDoc()` returns the single namespace root document `ns/{FIRESTORE_NAMESPACE}`; every collection hangs off it (`runs`, `runs/{runId}/jobs`, `seen`, `users`), per ADR-0001.
- [x] The Firestore `Repo` adapter implements the full port, using `FieldValue.increment` (never read-modify-write) for funnel counts, one document per Evaluation.
- [x] Code refuses to start with `FIRESTORE_NAMESPACE=prod` unless `NODE_ENV=production`; env parsed once at startup, fail fast.
- [x] The ticket-02 contract suite runs against the Firestore adapter **when credentials are present**, in a unique `test-<random>` namespace, torn down with `recursiveDelete(nsDoc())` in `afterAll`. Skipped cleanly when no credentials.
- [x] Browsers have no access (documented in `firestore.rules`); only the Admin SDK reads/writes.

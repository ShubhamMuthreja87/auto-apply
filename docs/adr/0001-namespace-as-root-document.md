# Firestore isolation via a namespace root document

All Firestore data is isolated by `FIRESTORE_NAMESPACE` (`dev`, `prod`, or a disposable `test-<random>`) by hanging **every** collection off a single root document — `ns/{namespace}` — rather than by prefixing top-level collection names (`${ns}__runs`, …). One `nsDoc()` function returns `db.doc('ns/' + FIRESTORE_NAMESPACE)` and all paths (`runs/{runId}`, `runs/{runId}/jobs/{evalId}`, `seen/{jobKey}`, `users/{uid}`) are built from it. `seen` sits beside `runs`, not under a run, because dedupe spans runs (D15).

## Considered Options

- **Namespace root document (chosen).** A whole namespace is one subtree, so a test run tears itself down with a single `firestore.recursiveDelete(nsDoc())`, and there is no way for a query to accidentally span namespaces — the prefix is structural, not a string every call site must remember to apply.
- **Prefixed top-level collections** (`${ns}__runs`). Rejected: isolation depends on every call site using the prefix correctly, and cleaning a `test-*` namespace means enumerating and deleting each prefixed collection separately.

## Consequences

- Per-run evaluations are a subcollection of their run (`runs/{runId}/jobs`); the evaluation doc id and the seen key are the same `jobKey` string (`${ats}:${board}:${jobId}`, D14).
- Reads/writes carry one extra path segment; negligible, and never exposed outside the repository adapter.
- The in-memory repository mirrors the same logical layout so the two implementations stay swappable.

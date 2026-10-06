# 02: Repo port + in-memory twin + shared contract suite

**What to build:** The persistence port the whole app depends on, its in-memory implementation, and a shared contract test suite that any `Repo` implementation must pass — so the in-memory twin can never drift from Firestore semantics.

**Blocked by:** 01.

**Status:** done (commit 3486302)

Interface shape (from grilling, trimmed to the decision):

```ts
interface Repo {
  getUser(uid): Promise<UserDoc | null>;
  seedUserIfMissing(uid, doc): Promise<void>;
  createRun(run): Promise<void>; // rejects if an active Run exists → 409
  getActiveRun(uid): Promise<Run | null>;
  patchRun(runId, delta): Promise<void>;
  putEvaluation(runId, evalDoc): Promise<void>;
  patchEvaluation(runId, jobKey, delta): Promise<void>;
  isSeen(jobKey): Promise<boolean>;
  markSeen(jobKey): Promise<void>;
  watchRun(runId, cb): Unsubscribe; // async initial snapshot, then per-change deltas
  watchEvaluations(runId, cb): Unsubscribe;
}
```

- [x] `Repo` interface and its document types live in `packages/shared` (or are imported by it) as the contract.
- [x] In-memory implementation mirrors the ADR-0001 logical layout; `jobKey(posting)` → `${ats}:${board}:${jobId}` is both the Evaluation id and the Seen key.
- [x] Subscription semantics: initial callback delivered on a microtask (not synchronously); a callback fires on every matching write (local writes echo back); delta ordering preserved.
- [x] `createRun` rejects when an active Run already exists (the future 409).
- [x] A **shared contract suite** exercises any `Repo`: async-initial snapshot, delta ordering, funnel-count increments, seen/active-run behaviour. It runs against the in-memory implementation here and is structured so a second implementation can be dropped in (ticket 03).

## Log
- Built in `3486302` before this run. 2026-10-06 audit: all bullets verified. Later changed by ADR-0003 (`2141819`, state-based subscriptions): adapters may coalesce writes, and `watch*` gained `onError` and batch delivery; the in-memory twin still delivers one callback per write.

# Repo subscriptions are state-based, not event logs

`Repo.watchRun` and `Repo.watchEvaluations` deliver **state**, not a log of writes. The initial snapshot arrives asynchronously; later callbacks arrive in write order, may merge several rapid writes into one (as Firestore's `onSnapshot` does), never deliver an older state after a newer one, and the last callback always reflects the latest write. Every subscription also takes an `onError` callback: a listener failure or a document that fails contract validation is reported there, never silently dropped (so the SSE stream can surface it instead of going quiet). Consumers — the SSE stream and the UI — therefore **render the latest state they were given and never count events**: funnel numbers come from the Run's `funnel` field, job lists from the latest Evaluation per Job Key.

## Considered Options

- **State-based, may coalesce (chosen).** Matches what Firestore actually guarantees, so the in-memory twin and the real adapter pass one shared contract suite.
- **One callback per write.** Rejected: Firestore cannot promise it, so the contract would hold only for the in-memory twin, and any consumer that counted callbacks (e.g. "+1 submitted per event") would be right in tests and wrong in production.

## Consequences

- The shared contract suite polls for deliveries and asserts "in order, possibly coalesced, ends on the latest write"; the in-memory twin's stricter one-per-write behaviour is pinned in its own test, not relied on by consumers.
- SSE deltas (ticket 05) carry full Run / Evaluation documents, never increments.
- `watchEvaluations` delivers **batches**, one per snapshot, like a Firestore query `onSnapshot`. The initial batch always arrives, even when it is empty, so the SSE stream knows when it holds the full initial state before sending its `snapshot` event (ticket 05). Without it, a Run with no Evaluations yet would never produce an initial callback, and "nothing yet" would look the same as "not loaded".

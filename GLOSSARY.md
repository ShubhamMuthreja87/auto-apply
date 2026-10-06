# AI Auto-Apply

The ubiquitous language for the auto-apply prototype: the terms that recur across the API, the pipeline, Firestore and the UI. Implementation lives in code and ADRs; this file only fixes what words mean.

## Language

### Jobs and evaluation

**Posting**:
A single job as returned by an ATS board, normalised into our own shape (`ats`, `board`, `jobId`, `title`, `company`, `location`, `descriptionText`, `applyUrl`, plus a parsed `remote` flag and its `source`: `live`, `fallback` when the board failed and its recorded fixtures stood in (D3), or `fixture` in fixtures-only mode). The unit of discovery.
_Avoid_: listing, job (bare), opening, req

**Evaluation**:
The per-run record of what we decided about one Posting — its verdict, per-criterion evidence, score, built payload and status. Stored as one document under a Run. The "Applied jobs" and "Scanned jobs" screens are views over Evaluations, not separate entities.
_Avoid_: result, match, application record

**Job Key**:
The stable identity of a Posting across the several URLs an ATS exposes for it: the string `${ats}:${board}:${jobId}`. Used both as the Evaluation document id (within its Run) and as the Seen key.
_Avoid_: job id (ambiguous — that is only the ATS's own id), slug

**Verdict**:
The outcome the rubric assigns a Posting: `APPLY NOW`, `APPLY`, `STRETCH` (and below), or `BLOCKED`. Drives whether the Posting is submitted, held, skipped or blocked.

### Run

**Run**:
One unattended pass of the pipeline triggered by the Auto-apply button: discover Postings, evaluate them, apply to the qualifying ones. At most one is active per user.

**Seen**:
A Posting the user has encountered in any previous Run, recorded by its Job Key beside (not inside) Runs, so dedupe spans Runs. Seen Postings are always skipped.
_Avoid_: processed, applied, visited

**Namespace**:
The isolation boundary for all Firestore data — `dev`, `prod`, or a unique `test-<random>` — materialised as a single root document (`ns/{namespace}`) that every collection hangs off, so a namespace can be deleted as one subtree.
_Avoid_: tenant, environment, scope

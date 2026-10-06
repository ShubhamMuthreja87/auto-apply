import { loadConfig } from "./config.js";
import { createApp } from "./app.js";
import { logger } from "./logger.js";
import { createRepo } from "./repo/create-repo.js";
import { buildPipeline } from "./pipeline/pipeline.js";
import { skeletonJobSource } from "./pipeline/skeleton-job-source.js";
import { recoverInterruptedRuns } from "./runs/recover-interrupted-runs.js";
import { DEMO_UID } from "./user.js";

// Env and the Firestore credential are both validated here, once; anything
// invalid stops the boot.
const config = loadConfig();
const persistence = createRepo(config);
// The composition root: real clock and timers here, fakes in tests.
const pipeline = buildPipeline({
  repo: persistence.repo,
  jobSource: skeletonJobSource,
  clock: () => new Date(),
  delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  newRunId: () => crypto.randomUUID(),
});
const app = createApp(config, persistence, pipeline);

if (persistence.kind === "memory") {
  logger.warn("persistence_in_memory", { reason: "REPO=memory; data is lost on restart" });
}

// Before listening, so no Run of this boot exists yet: whatever is still
// active was killed by the restart and is failed as interrupted.
await recoverInterruptedRuns(persistence.repo, [DEMO_UID]);

app.listen(config.PORT, () => {
  logger.info("api_listening", {
    port: config.PORT,
    namespace: config.FIRESTORE_NAMESPACE,
    persistence: persistence.kind,
  });
});

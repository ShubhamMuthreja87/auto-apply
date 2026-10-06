import { loadConfig } from "./config.js";
import { createApp } from "./app.js";
import { logger } from "./logger.js";
import { createRepo } from "./repo/create-repo.js";
import { buildPipeline } from "./pipeline/pipeline.js";
import { skeletonJobSource } from "./pipeline/skeleton-job-source.js";
import { DEMO_UID, loadUser, seedUser } from "./user.js";

// Env and the Firestore credential are both validated here, once; anything
// invalid stops the boot.
const config = loadConfig();
const persistence = createRepo(config);
const repo = persistence.repo;

// First boot of a namespace writes the seed user; later boots keep any edits
// (D13). A failure here stops the boot rather than serving without a user.
await seedUser(repo, DEMO_UID);

// The composition root: real clock and timers here, fakes in tests.
const pipeline = buildPipeline({
  repo,
  jobSource: skeletonJobSource,
  clock: () => new Date(),
  delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  newRunId: () => crypto.randomUUID(),
  loadUser: (uid) => loadUser(repo, uid),
});
const app = createApp(config, persistence, pipeline);

if (persistence.kind === "memory") {
  logger.warn("persistence_in_memory", { reason: "REPO=memory; data is lost on restart" });
}

app.listen(config.PORT, () => {
  logger.info("api_listening", {
    port: config.PORT,
    namespace: config.FIRESTORE_NAMESPACE,
    persistence: persistence.kind,
  });
});

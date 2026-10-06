import { loadConfig } from "./config.js";
import { createApp } from "./app.js";
import { logger } from "./logger.js";
import { createRepo } from "./repo/create-repo.js";
import { buildPipeline } from "./pipeline/pipeline.js";
import { BOARDS } from "./discovery/boards.js";
import { createDiscovery } from "./discovery/discovery.js";
import { readBoardFixture } from "./discovery/fixtures.js";
import { greenhouseJobSource } from "./discovery/greenhouse.js";

// Env and the Firestore credential are both validated here, once; anything
// invalid stops the boot.
const config = loadConfig();
const persistence = createRepo(config);
// The composition root: real network, clock and timers here, fakes in tests.
const discovery = createDiscovery({
  sources: [greenhouseJobSource({ fetch, timeoutMs: 10_000 })],
  boards: BOARDS,
  readFixture: readBoardFixture,
  mode: config.JOB_SOURCE,
});
const pipeline = buildPipeline({
  repo: persistence.repo,
  discovery,
  clock: () => new Date(),
  delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  newRunId: () => crypto.randomUUID(),
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
    jobSource: config.JOB_SOURCE,
  });
});

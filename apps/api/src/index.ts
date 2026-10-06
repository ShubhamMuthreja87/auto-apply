import { loadConfig } from "./config.js";
import { createApp } from "./app.js";
import { logger } from "./logger.js";
import { createRepo } from "./repo/create-repo.js";
import { buildPipeline } from "./pipeline/pipeline.js";
import { BOARDS } from "./discovery/boards.js";
import { createDiscovery } from "./discovery/discovery.js";
import { readBoardFixture } from "./discovery/fixtures.js";
import { greenhouseJobSource } from "./discovery/greenhouse.js";
import { keywordMatcher } from "./evaluation/keyword-matcher.js";
import { recoverInterruptedRuns } from "./runs/recover-interrupted-runs.js";
import { DEMO_UID, loadUser, seedUser } from "./user.js";

// Env and the Firestore credential are both validated here, once; anything
// invalid stops the boot.
const config = loadConfig();
const persistence = createRepo(config);
const repo = persistence.repo;

// First boot of a namespace writes the seed user; later boots keep any edits
// (D13). A failure here stops the boot rather than serving without a user.
await seedUser(repo, DEMO_UID);

// The composition root: real network, clock and timers here, fakes in tests.
const discovery = createDiscovery({
  sources: [greenhouseJobSource({ fetch, timeoutMs: 10_000 })],
  boards: BOARDS,
  readFixture: readBoardFixture,
  mode: config.JOB_SOURCE,
});
const pipeline = buildPipeline({
  repo,
  discovery,
  // No AI client yet (ticket 09): the whole Run uses fallback scoring (D24).
  evaluator: keywordMatcher,
  screening: { salaryFloorLpa: config.SALARY_FLOOR_LPA },
  clock: () => new Date(),
  delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  newRunId: () => crypto.randomUUID(),
  loadUser: (uid) => loadUser(repo, uid),
});
const app = createApp(config, persistence, pipeline);

if (persistence.kind === "memory") {
  logger.warn("persistence_in_memory", { reason: "REPO=memory; data is lost on restart" });
}

// Before listening, so no Run of this boot exists yet: whatever is still
// active was killed by the restart and is failed as interrupted.
await recoverInterruptedRuns(repo, [DEMO_UID]);

app.listen(config.PORT, () => {
  logger.info("api_listening", {
    port: config.PORT,
    namespace: config.FIRESTORE_NAMESPACE,
    persistence: persistence.kind,
    jobSource: config.JOB_SOURCE,
  });
});

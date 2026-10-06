import { loadConfig } from "./config.js";
import { createApp } from "./app.js";
import { logger } from "./logger.js";
import { createRepo } from "./repo/create-repo.js";
import { buildPipeline } from "./pipeline/pipeline.js";
import { boardsFor } from "./discovery/boards.js";
import { createDiscovery } from "./discovery/discovery.js";
import { readBoardFixture } from "./discovery/fixtures.js";
import { greenhouseJobSource } from "./discovery/greenhouse.js";
import { createScoring } from "./ai/scoring.js";
import { createFreeTextAnswerer } from "./ai/free-text-answerer.js";
import { greenhouseForms } from "./forms/greenhouse-forms.js";
import { simulatedSubmitter } from "./submit/simulated-submitter.js";
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
const clock = () => new Date();
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const discovery = createDiscovery({
  sources: [greenhouseJobSource({ fetch, timeoutMs: 10_000 })],
  // Fixtures mode adds the synthetic demo board; live never does.
  boards: boardsFor(config.JOB_SOURCE),
  readFixture: readBoardFixture,
  mode: config.JOB_SOURCE,
});
// With an AI key the model judges each Posting (falling back per Posting);
// without one the whole Run uses the keyword matcher (D24).
const scoring = createScoring(config, fetch);
const pipeline = buildPipeline({
  repo,
  discovery,
  evaluator: scoring.evaluator,
  // APPLY NOW forms: GET only, recorded form as fallback (D3, D5); in
  // fixtures mode the recordings alone, like discovery.
  forms: greenhouseForms({ fetch, timeoutMs: 10_000, mode: config.JOB_SOURCE }),
  // Without an AI key, required free text falls to the user (D24).
  answerer: scoring.chat ? createFreeTextAnswerer({ chat: scoring.chat }) : null,
  // Builds and stores the real payload; never sends it (D18).
  submitter: simulatedSubmitter({ clock, delay }),
  scoringMode: scoring.mode,
  screening: { salaryFloorLpa: config.SALARY_FLOOR_LPA },
  clock,
  delay,
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
    scoring: scoring.mode,
  });
});

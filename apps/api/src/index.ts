import { loadConfig } from "./config.js";
import { createApp } from "./app.js";
import { logger } from "./logger.js";
import { createRepo } from "./repo/create-repo.js";

// Env and the Firestore credential are both validated here, once; anything
// invalid stops the boot. The run routes take `persistence.repo` in ticket 05.
const config = loadConfig();
const persistence = createRepo(config);
const app = createApp(config);

if (persistence.kind === "memory") {
  logger.warn("persistence_in_memory", {
    reason: "no Firestore credential configured; data is lost on restart",
  });
}

app.listen(config.PORT, () => {
  logger.info("api_listening", {
    port: config.PORT,
    namespace: config.FIRESTORE_NAMESPACE,
    persistence: persistence.kind,
  });
});

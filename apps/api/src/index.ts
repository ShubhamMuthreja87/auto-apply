import { loadConfig } from "./config.js";
import { createApp } from "./app.js";
import { logger } from "./logger.js";

const config = loadConfig();
const app = createApp(config);

app.listen(config.PORT, () => {
  logger.info("api_listening", {
    port: config.PORT,
    namespace: config.FIRESTORE_NAMESPACE,
  });
});

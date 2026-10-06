import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import {
  errorResponseSchema,
  healthResponseSchema,
  type HealthResponse,
} from "@auto-apply/shared";
import type { Config } from "./config.js";
import type { Persistence } from "./repo/create-repo.js";
import type { Pipeline } from "./pipeline/pipeline.js";
import { logger } from "./logger.js";
import { runsRouter } from "./routes/runs.js";
import { meRouter } from "./routes/me.js";

export interface AppOptions {
  /** Interval of the SSE heartbeat comment; 15 s by default (CLAUDE.md). */
  heartbeatMs?: number;
}

/**
 * Builds the Express app. Kept separate from `index.ts` so tests can drive it
 * with Supertest without opening a socket. Routes stay thin: they parse, call
 * the pipeline or repository, and map the result to HTTP.
 */
export function createApp(
  config: Config,
  persistence: Persistence,
  pipeline: Pipeline,
  options: AppOptions = {},
) {
  const app = express();

  // Behind nginx in production (CLAUDE.md, Deployment).
  app.set("trust proxy", 1);

  // Exactly one origin, with credentials (D27): the browser's EventSource is
  // opened `withCredentials`, which a `*` origin would make it refuse.
  app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }));

  app.use(express.json({ limit: "100kb" }));

  app.get("/api/health", (_req: Request, res: Response) => {
    const body: HealthResponse = {
      status: "ok",
      service: "auto-apply-api",
      namespace: config.FIRESTORE_NAMESPACE,
      repo: persistence.kind,
      time: new Date().toISOString(),
    };
    res.json(healthResponseSchema.parse(body));
  });

  app.use(meRouter(persistence.repo));
  app.use(runsRouter(persistence.repo, pipeline, options.heartbeatMs ?? 15_000));

  // Unknown routes get the shared JSON error shape, not Express's HTML default.
  app.use((_req: Request, res: Response) => {
    res.status(404).json(
      errorResponseSchema.parse({
        error: { code: "not_found", message: "Not found" },
      }),
    );
  });

  // Errors return the shared JSON shape, never a stack trace (CODING_STANDARDS).
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    logger.error("unhandled_error", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json(
      errorResponseSchema.parse({
        error: { code: "internal", message: "Internal server error" },
      }),
    );
  });

  return app;
}

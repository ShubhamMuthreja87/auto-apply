import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import {
  errorResponseSchema,
  healthResponseSchema,
  type HealthResponse,
} from "@auto-apply/shared";
import type { Config } from "./config.js";
import type { Persistence } from "./repo/create-repo.js";
import { logger } from "./logger.js";

/**
 * Builds the Express app. Kept separate from `index.ts` so tests can drive it
 * with Supertest without opening a socket. Routes stay thin: later tickets add
 * the run routes and the SSE stream here.
 */
export function createApp(config: Config, persistence: Persistence) {
  const app = express();

  // Behind nginx in production (CLAUDE.md, Deployment).
  app.set("trust proxy", 1);

  // Permissive dev CORS so web (5173) can call api (3001). Tightened to an
  // exact origin with credentials in ticket 15 (D27).
  app.use(cors());

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

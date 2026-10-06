/**
 * The Run routes. Thin by design (CODING_STANDARDS, API): parse with zod, call
 * the pipeline or the repository, map the outcome to HTTP. The Run itself runs
 * in the background, so `POST` answers `202` straight away.
 */
import { Router, type Response } from "express";
import { z } from "zod";
import {
  ActiveRunExistsError,
  activeRunResponseSchema,
  createRunResponseSchema,
  errorResponseSchema,
  type Repo,
} from "@auto-apply/shared";
import type { Pipeline } from "../pipeline/pipeline.js";
import { DEMO_UID } from "../user.js";
import { streamRun } from "./run-stream.js";

/** Run ids are UUIDs; anything else never names a Run (and never a Firestore path). */
const runParamsSchema = z.object({ runId: z.string().regex(/^[A-Za-z0-9-]{1,64}$/) });

function sendError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json(errorResponseSchema.parse({ error: { code, message } }));
}

export function runsRouter(repo: Repo, pipeline: Pipeline, heartbeatMs: number): Router {
  const router = Router();

  router.post("/api/runs", async (_req, res, next) => {
    try {
      const { runId } = await pipeline.startRun(DEMO_UID);
      res.status(202).json(createRunResponseSchema.parse({ runId }));
    } catch (err) {
      if (err instanceof ActiveRunExistsError) {
        sendError(res, 409, "run_active", "A run is already in progress");
        return;
      }
      next(err);
    }
  });

  router.get("/api/runs/active", async (_req, res, next) => {
    try {
      const run = await repo.getActiveRun(DEMO_UID);
      res.json(activeRunResponseSchema.parse({ run }));
    } catch (err) {
      next(err);
    }
  });

  router.get("/api/runs/:runId/events", async (req, res, next) => {
    const params = runParamsSchema.safeParse(req.params);
    if (!params.success) {
      sendError(res, 400, "invalid_request", "Malformed run id");
      return;
    }
    try {
      const run = await repo.getRun(params.data.runId);
      if (!run || run.uid !== DEMO_UID) {
        sendError(res, 404, "run_not_found", "No such run");
        return;
      }
      streamRun(req, res, { repo, runId: run.runId, heartbeatMs });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

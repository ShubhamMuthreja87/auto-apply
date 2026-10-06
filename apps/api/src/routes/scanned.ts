/**
 * The Scanned jobs reads (ticket 12): the user's Runs, and the stored
 * Evaluations of one Run or of every Run. Thin: parse the query, read through
 * the `Repo`, map to HTTP. A stored document that breaks the contract rejects
 * the read and becomes the shared `500` shape.
 */
import { Router } from "express";
import { z } from "zod";
import {
  errorResponseSchema,
  evaluationsListResponseSchema,
  runsListResponseSchema,
  type Evaluation,
  type Repo,
} from "@auto-apply/shared";
import { DEMO_UID } from "../user.js";
import { runIdSchema } from "./runs.js";

const evaluationsQuerySchema = z.object({ runId: runIdSchema.optional() });

export function scannedRouter(repo: Repo): Router {
  const router = Router();

  router.get("/api/runs", async (_req, res, next) => {
    try {
      const runs = await repo.listRuns(DEMO_UID);
      res.json(runsListResponseSchema.parse({ runs }));
    } catch (err) {
      next(err);
    }
  });

  router.get("/api/evaluations", async (req, res, next) => {
    const query = evaluationsQuerySchema.safeParse(req.query);
    if (!query.success) {
      res.status(400).json(
        errorResponseSchema.parse({
          error: { code: "invalid_request", message: "Malformed run id" },
        }),
      );
      return;
    }
    try {
      const { runId } = query.data;
      let evaluations: Evaluation[];
      if (runId === undefined) {
        // A user has few Runs, so one read per Run stays cheap (newest first).
        const runs = await repo.listRuns(DEMO_UID);
        const perRun = await Promise.all(runs.map((run) => repo.listEvaluations(run.runId)));
        evaluations = perRun.flat();
      } else {
        const run = await repo.getRun(runId);
        if (!run || run.uid !== DEMO_UID) {
          res.status(404).json(
            errorResponseSchema.parse({
              error: { code: "run_not_found", message: "No such run" },
            }),
          );
          return;
        }
        evaluations = await repo.listEvaluations(run.runId);
      }
      res.json(evaluationsListResponseSchema.parse({ evaluations }));
    } catch (err) {
      next(err);
    }
  });

  return router;
}

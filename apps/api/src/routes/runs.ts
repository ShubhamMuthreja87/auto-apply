/**
 * The Run routes. Thin by design (CODING_STANDARDS, API): parse with zod, call
 * the pipeline or the repository, map the outcome to HTTP. The Run itself runs
 * in the background, so `POST` answers `202` straight away.
 */
import { Router } from "express";
import { z } from "zod";
import {
  ActiveRunExistsError,
  activeRunResponseSchema,
  createRunResponseSchema,
  retrySubmitResponseSchema,
  submitAnswersRequestSchema,
  submitAnswersResponseSchema,
  type Repo,
} from "@auto-apply/shared";
import {
  EvaluationNotFoundError,
  InvalidAnswersError,
  type Pipeline,
} from "../pipeline/pipeline.js";
import { IllegalTransitionError } from "../pipeline/transitions.js";
import { DEMO_UID } from "../user.js";
import { streamRun } from "./run-stream.js";
import { ownRunOr404, sendError } from "../send-error.js";

/** Run ids are UUIDs; anything else never names a Run (and never a Firestore path). */
export const runIdSchema = z.string().regex(/^[A-Za-z0-9-]{1,64}$/);
const runParamsSchema = z.object({ runId: runIdSchema });
/** A Job Key, `ats:board:jobId` (D14); never anything that could leave a Firestore path. */
const jobKeySchema = z.string().regex(/^[a-z]+:[A-Za-z0-9-]{1,100}:[A-Za-z0-9-]{1,100}$/);
const retryParamsSchema = z.object({ runId: runIdSchema, jobKey: jobKeySchema });

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

  // Retry of a simulated failure (D19): a short simulated send, answered
  // when done so the caller gets the submitted Evaluation back.
  router.post("/api/runs/:runId/jobs/:jobKey/retry", async (req, res, next) => {
    const params = retryParamsSchema.safeParse(req.params);
    if (!params.success) {
      sendError(res, 400, "invalid_request", "Malformed run id or job key");
      return;
    }
    try {
      const run = await ownRunOr404(repo, res, params.data.runId);
      if (!run) return;
      const evaluation = await pipeline.retrySubmit(run.runId, params.data.jobKey);
      res.json(retrySubmitResponseSchema.parse({ evaluation }));
    } catch (err) {
      if (err instanceof EvaluationNotFoundError) {
        sendError(res, 404, "job_not_found", "No such job in this run");
        return;
      }
      if (err instanceof IllegalTransitionError) {
        sendError(res, 409, "not_retryable", "Only a simulated failure can be retried");
        return;
      }
      next(err);
    }
  });

  // Answer & submit: the user answers a needs_you job's missing fields, and
  // it is submitted (simulated), answered when the short simulated send ends.
  router.post("/api/runs/:runId/jobs/:jobKey/answers", async (req, res, next) => {
    const params = retryParamsSchema.safeParse(req.params);
    if (!params.success) {
      sendError(res, 400, "invalid_request", "Malformed run id or job key");
      return;
    }
    const body = submitAnswersRequestSchema.safeParse(req.body);
    if (!body.success) {
      // Never echo the body: the answers can be personal.
      sendError(res, 400, "invalid_request", "Expected { answers: { [fieldId]: value } }");
      return;
    }
    try {
      const run = await ownRunOr404(repo, res, params.data.runId);
      if (!run) return;
      const evaluation = await pipeline.submitAnswers(
        run.runId,
        params.data.jobKey,
        body.data.answers,
      );
      res.json(submitAnswersResponseSchema.parse({ evaluation }));
    } catch (err) {
      if (err instanceof EvaluationNotFoundError) {
        sendError(res, 404, "job_not_found", "No such job in this run");
        return;
      }
      if (err instanceof InvalidAnswersError) {
        sendError(
          res,
          400,
          "invalid_answers",
          `Missing or invalid answers for: ${err.fieldIds.join(", ")}`,
        );
        return;
      }
      if (err instanceof IllegalTransitionError) {
        sendError(res, 409, "not_answerable", "Only a job that needs your answers can be answered");
        return;
      }
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
      const run = await ownRunOr404(repo, res, params.data.runId);
      if (!run) return;
      streamRun(req, res, { repo, runId: run.runId, heartbeatMs });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

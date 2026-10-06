/**
 * `GET /api/me`: the user document (profile, preferences, settings), validated
 * on read. `PUT /api/me` (ticket 17): the user's edits, validated with the
 * contract and saved through the `Repo`; it never seeds. Thin: parse, call the
 * user module, map its errors to HTTP.
 */
import { Router, type NextFunction, type Response } from "express";
import {
  meResponseSchema,
  updateMeRequestSchema,
  updateMeResponseSchema,
  type Repo,
} from "@auto-apply/shared";
import { logger } from "../logger.js";
import {
  DEMO_UID,
  loadUser,
  saveUserEdits,
  UserDocInvalidError,
  UserNotFoundError,
} from "../user.js";
import { sendError } from "../send-error.js";

export function meRouter(repo: Repo): Router {
  const router = Router();

  router.get("/api/me", async (_req, res, next) => {
    try {
      const user = await loadUser(repo, DEMO_UID);
      res.json(meResponseSchema.parse(user));
    } catch (err) {
      sendUserError(err, res, next);
    }
  });

  router.put("/api/me", async (req, res, next) => {
    const edits = updateMeRequestSchema.safeParse(req.body);
    if (!edits.success) {
      // Field paths and our own messages only, never the submitted values.
      const message = edits.error.issues
        .map((issue) => `${issue.path.join(".") || "body"}: ${issueText(issue)}`)
        .join("; ");
      sendError(res, 400, "invalid_request", message);
      return;
    }
    try {
      const user = await saveUserEdits(repo, DEMO_UID, edits.data);
      res.json(updateMeResponseSchema.parse(user));
    } catch (err) {
      sendUserError(err, res, next);
    }
  });

  return router;
}

/**
 * Custom issues carry messages written in the contract; zod's built-in ones
 * are reduced to their code, since some echo the submitted value.
 */
function issueText(issue: { code: string; message: string }): string {
  return issue.code === "custom" ? issue.message : issue.code;
}

function sendUserError(err: unknown, res: Response, next: NextFunction): void {
  if (err instanceof UserNotFoundError) {
    sendError(res, 404, "user_not_found", "No user document");
    return;
  }
  if (err instanceof UserDocInvalidError) {
    // The issues carry field paths and issue codes only, never stored values.
    logger.error("user_doc_invalid", { uid: err.uid, issues: err.issues });
    sendError(res, 500, "user_doc_invalid", "The stored user document is invalid");
    return;
  }
  next(err);
}

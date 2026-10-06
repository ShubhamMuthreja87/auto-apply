/**
 * `GET /api/me`: the user document (profile, preferences, settings), validated
 * on read. Thin: load through the user module, map its errors to HTTP.
 */
import { Router } from "express";
import { errorResponseSchema, meResponseSchema, type Repo } from "@auto-apply/shared";
import { logger } from "../logger.js";
import { DEMO_UID, loadUser, UserDocInvalidError, UserNotFoundError } from "../user.js";

export function meRouter(repo: Repo): Router {
  const router = Router();

  router.get("/api/me", async (_req, res, next) => {
    try {
      const user = await loadUser(repo, DEMO_UID);
      res.json(meResponseSchema.parse(user));
    } catch (err) {
      if (err instanceof UserNotFoundError) {
        res
          .status(404)
          .json(
            errorResponseSchema.parse({
              error: { code: "user_not_found", message: "No user document" },
            }),
          );
        return;
      }
      if (err instanceof UserDocInvalidError) {
        // The issues carry field paths and issue codes only, never stored values.
        logger.error("user_doc_invalid", { uid: err.uid, issues: err.issues });
        res.status(500).json(
          errorResponseSchema.parse({
            error: { code: "user_doc_invalid", message: "The stored user document is invalid" },
          }),
        );
        return;
      }
      next(err);
    }
  });

  return router;
}

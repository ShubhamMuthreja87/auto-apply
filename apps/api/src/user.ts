/**
 * The single user document (D13): seeded on first boot, then loaded and
 * validated on every read. Everything goes through the `Repo` port, so no
 * module reads Firestore directly; the composition root hands `loadUser` to
 * the pipeline and the routes.
 */
import { userSchema, type Repo, type User } from "@auto-apply/shared";
import { SEED_USER } from "./seed-user.js";

/**
 * The single user's id (D13, D26). Until login lands (ticket 15) every request
 * acts as this user; after it, the JWT's `sub` carries the same fixed id.
 */
export const DEMO_UID = "demo-user";

/** No user document exists for the uid (the boot seed did not run). */
export class UserNotFoundError extends Error {
  constructor(readonly uid: string) {
    super(`no user document for ${uid}`);
    this.name = "UserNotFoundError";
  }
}

/** The stored user document does not match the contract's `userSchema`. */
export class UserDocInvalidError extends Error {
  constructor(
    readonly uid: string,
    readonly issues: string[],
  ) {
    super(`user document for ${uid} is invalid: ${issues.join("; ")}`);
    this.name = "UserDocInvalidError";
  }
}

/**
 * Writes the seed profile on first boot only (D13): a no-op when the document
 * already exists, so later edits are never overwritten.
 */
export async function seedUser(repo: Repo, uid: string): Promise<void> {
  await repo.seedUserIfMissing(uid, { uid, ...SEED_USER });
}

/** Loads the user document and validates profile, preferences and settings. */
export async function loadUser(repo: Repo, uid: string): Promise<User> {
  const doc = await repo.getUser(uid);
  if (!doc) throw new UserNotFoundError(uid);
  const parsed = userSchema.safeParse(doc);
  if (!parsed.success) {
    throw new UserDocInvalidError(
      uid,
      // Path and issue code only: zod messages can echo stored values (PII).
      parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.code}`),
    );
  }
  return parsed.data;
}

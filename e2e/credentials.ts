/**
 * The e2e login. A fixed, non-secret value that exists only for the
 * deterministic end-to-end run: the API under test gets a bcrypt hash of it,
 * computed when Playwright loads its config, and an in-memory store that dies
 * with the process. It unlocks nothing outside that run.
 *
 * Fixed rather than random because Playwright loads the config in the runner
 * and again in each worker; a random password would differ between the server
 * the runner starts and the spec a worker runs.
 */
export const E2E_USERNAME = "e2e-jobseeker";
export const E2E_PASSWORD = "e2e-only-not-a-secret";

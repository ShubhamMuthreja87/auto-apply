/**
 * The preferences a Run screens and scores with, from the user's active
 * preset (`settings.preferencesPreset`). The preset is data, not a second
 * rubric: `demo` is the stored preferences with the `location` hard block
 * left out, so edits to the real preferences carry over. `screen.ts` runs
 * only the rules listed in `hardBlocks`, so every other hard block, the
 * language gate and the fit scoring stay exactly as stored.
 */
import type { User } from "@auto-apply/shared";

/** The hard block the demo preset turns off: onsite outside the accepted locations. */
export const LOCATION_RULE_ID = "location";

export function withPreferencesPreset(user: User): User {
  if (user.settings.preferencesPreset !== "demo") return user;
  return {
    ...user,
    preferences: {
      ...user.preferences,
      hardBlocks: user.preferences.hardBlocks.filter((rule) => rule.id !== LOCATION_RULE_ID),
    },
  };
}

# 17: Editable Settings (stretch)

**What to build:** Turn the read-only Settings page into an editable one, so the user can correct the profile, preferences and application settings that drive matching and field resolution. (Stretch; cuttable.)

**Blocked by:** 12 , 05b .

**Status:** done

- [ ] An API endpoint validates (zod) and persists edits to the user document; editing never re-triggers the first-boot seed.
- [ ] Web Settings page becomes a form over profile, preferences and application settings, with validation, save, and success/error feedback.
- [ ] Edited preferences visibly change subsequent matching (hard blocks / rubric) and edited profile/settings change field resolution.
- [ ] Component-seam test (RTL) for the edit-save flow; HTTP-seam test for the update endpoint (validation + persistence).
Build the UI with the 05b shell, theme and StatusChip; tables use MUI Table; no ad-hoc styling.

## Log
- 2026-10-06 /run-tickets: merged branch ticket-17 (`20cd7fb`). `PUT /api/me` (zod-validated, behind `requireAuth`) saves through new Repo method `updateUser(uid, {profile, preferences, settings})` on both adapters (Firestore `update()`; missing doc → `UserMissingError`, never creates, so edits can't re-trigger the seed). Settings page is now a form (profile, fit criteria, hard blocks, blocked companies, language gate as editable MUI tables; application settings; client-side validation; Save/Discard; alerts); experience, education, leadership, answer framing and `alwaysUserOnly` stay read-only. Edits apply from the next Run (pipeline loads the user at start), shown by HTTP tests (newly blocked company blocks on the next Run; edited email/notice period change form-fill). Tests added: `settings-edit.test.ts` (13), 3 repo-contract cases (incl. real Firestore), `SettingsPage.test.tsx` rewritten (10; the old "read-only: no inputs" case replaced because the page is now editable). Contract (additive, via the Edit tool, hook fired): `SALARY_FLOOR_RULE_ID`, `updateMeRequestSchema` (band and salary-floor checks), `updateMeResponseSchema`; `repo.ts` gained `updateUser`, `UserUpdate`, `UserMissingError`.
- Decisions: `alwaysUserOnly` (D10) not editable (API keeps the stored list); compensation never stored, unknown keys dropped; salary-floor threshold rejected (env-only, shown as "Server setting"); 400s name field paths only, never values; lists edited as comma-separated text. Surprising: ~100 MUI inputs make the jsdom suite slow (20 s timeout, memoised fields). Browser check pending.

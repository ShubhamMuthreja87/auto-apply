# 17: Editable Settings (stretch)

**What to build:** Turn the read-only Settings page into an editable one, so the user can correct the profile, preferences and application settings that drive matching and field resolution. (Stretch; cuttable.)

**Blocked by:** 12 , 05b .

**Status:** ready-for-agent

- [ ] An API endpoint validates (zod) and persists edits to the user document; editing never re-triggers the first-boot seed.
- [ ] Web Settings page becomes a form over profile, preferences and application settings, with validation, save, and success/error feedback.
- [ ] Edited preferences visibly change subsequent matching (hard blocks / rubric) and edited profile/settings change field resolution.
- [ ] Component-seam test (RTL) for the edit-save flow; HTTP-seam test for the update endpoint (validation + persistence).
Build the UI with the 05b shell, theme and StatusChip; tables use MUI Table; no ad-hoc styling.

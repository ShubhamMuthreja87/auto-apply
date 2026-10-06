# 14: Interrupted-run recovery + connection-state & empty/error UX + double-click guard

**What to build:** The live view never lies. A Run killed by a restart shows as failed rather than hanging; the stream's connection state is always visible; lists handle empty/error; and the button can't start two Runs. (Cuttable polish on top of the core live view.)

**Blocked by:** 05 ,05b .

**Status:** ready-for-agent

- [ ] On startup the API marks any Run still `running` from before boot as `failed:interrupted`, so the UI never shows a Run stuck forever.
- [ ] The `useRunStream` hook surfaces connection state: connecting / live / reconnecting / closed; the view reflects it.
- [ ] The Auto-apply button is disabled while a Run is active (client), complementing the server's 409.
- [ ] Run and list views render loading, empty and error states, not just the happy path.
- [ ] Component-seam tests (RTL, fake `EventSource`) cover the connection states and the interrupted-run display.
Build the UI with the 05b shell, theme and StatusChip; tables use MUI Table; no ad-hoc styling.

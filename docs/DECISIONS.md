# Product decisions (from the scoping chat, 6 Oct 2026)

Source of truth for WHAT the prototype does. `CLAUDE.md` summarises the technical consequences; `/grill-with-docs` decides HOW and records ADRs. If this file and `CLAUDE.md` disagree, this file wins.

## DECISIONS

1. The button triggers one unattended run. The brief asks for one button and live statuses; review mode is argued in the design doc as the launch default.
2. Live job discovery from the public Greenhouse, Lever and Ashby APIs, about 15 hardcoded boards, always with content=true. These are sanctioned, no-auth feeds of real jobs; scraping LinkedIn or Naukri carries terms-of-service and brittleness risk.
3. Fixtures serve as the test fake and as a labelled per-board fallback when a source fails. Tests stay deterministic, and the demo shows the API-reliability mitigation working.
4. Greenhouse first for applying; Lever and Ashby are discovery only. Only Greenhouse was verified to expose the application form as data (?questions=true).
5. The form schema merges questions, location_questions, education, and compliance/demographic_questions, using the hosted URL with the embed URL as fallback. The live check found Stripe's required School and Degree fields outside questions, and its hosted URL redirects off Greenhouse.
6. The rubric comes from my own job-search prompt, turned into a preferences object. It's explainable and additive, and the hardcoded preferences match a real user.
7. Code applies hard blocks first, the AI returns per-criterion evidence, and code sums the score and sets the verdict. Scores are reproducible and unit-testable, every point traces to a quote, and no tokens are spent on blocked jobs.
8. APPLY NOW is filled and submitted; APPLY is held (below_auto_threshold); STRETCH and below are skipped; hard-block failures are blocked. Only the highest-confidence matches go out unattended.
9. Each field is filled from one of four sources: profile, settings, AI (free text only), or user only. The system automates what the user has already decided and nothing else.
10. Legal agreements, employer AI-policy acknowledgements, consent and demographic questions are never auto-answered. The live check found Anthropic requiring an AI-policy acknowledgement and an arbitration agreement.
11. If any required field is unresolved, the job is held as needs_you, listing the fields. That is the honest version of "auto", and evidence for review mode.
12. The job title tier selects EM or Staff framing for AI answers, and every answer must trace to the profile or settings. This prevents invented notice periods, visa statuses or experience.
13. The profile is my own, seeded into a Firestore user document on first boot and editable on a settings page. It's real data, editable is better UX than hardcoded, and the seed keeps a fresh checkout working. The final JSON will be extracted from my resume.
14. Firestore holds the user document, runs, per-job evaluations (verdict, evidence, score, payload, status) and seen jobs keyed ats:board:jobId. The live check showed one job behind three URLs; the job ID is the only stable identity.
15. Seen jobs are always skipped. That dedupes runs, avoids repeat AI cost, and makes run two visibly different.
16. Run statuses are discovering → evaluating → applying → completed/failed, with funnel counts. Job statuses are queued → evaluating → blocked/skipped/held/applying → submitted (simulated)/failed, each with a reason. This covers the brief's success, failure and pending, with an explanation for every outcome.
17. One active run (409), 3 jobs in flight, and at most 15 AI evaluations per run. That bounds cost and duration, and statuses visibly stream in.
18. The simulated submit builds the real Greenhouse payload with real field IDs, waits, stores it, and is labelled "Submitted (simulated)" with a banner and "View payload". Everything except the final network call is real, and nothing is presented as a real application.
19. The first submit in each run fails with "Simulated failure (demo)"; Retry shows the payload and succeeds. It demonstrates the failure UX without pretending an error was real.
20. The UI has the button, the live run, an Applied jobs list, a Scanned jobs view and a Settings page. These are the history and reference views a user needs, all from data that is already stored.
21. Live updates use SSE from Express: a full snapshot on connect, then deltas, with the API listening via Firestore onSnapshot. The browser never touches Firebase. One API boundary, and refreshes and reconnects lose nothing.
22. The AI is DeepSeek through an OpenAI-compatible, env-swappable interface, with JSON output validated against the shared schema; production would use a provider with a DPA and no-training terms. The key and credit already exist, and the swappable interface is itself part of showing the work.
23. No name, contact details or address go to the model. Data minimisation; standard fields are filled deterministically.
24. On an AI timeout or invalid JSON, retry once, then use a keyword matcher for that job, labelled "fallback scoring"; with no key, the whole run uses the fallback. Runs never die on the AI step, and tests need no key.
25. No LangChain or agent frameworks. Two schema-bound calls don't justify one.
26. One user with a login page: bcrypt hash (cost 12) in env, JWT in an httpOnly; Secure; SameSite=Strict cookie with 12-hour expiry, no signup, and a rate limit on login. It protects my personal data and DeepSeek credit on a public URL, and the cookie is what lets SSE authenticate.
27. CORS allows one exact origin from env, with credentials. It's correct whether the API shares the app's domain or a subdomain, and it's deliberate rather than *.
28. Deploy to EC2: nginx serves the static build and proxies /api to Express under pm2 (one instance); certbot handles HTTPS; nodemon in development; the POST /api/runs rate limit is enabled from day one. A reviewer can press the button themselves, and the kit has already tested the SSE proxy path.

## Out of scope

- Real submission to employers (browser workers, extension, employer APIs); Playwright or Hermes experiments come later
- Review mode and approval queue (design doc: launch default)
- Applying through Lever or Ashby, other ATSs, agentic web discovery
- Re-evaluating seen jobs when a posting or the preferences change
- Retry limits, failure triage, human oversight of failures, capturing failures for the eval set
- Guardrails framework, PII redaction pipeline, batching, embedding prefilter, LangChain
- Resume parsing into the profile
- Multi-user support, signup, password reset, roles
- Scheduled or background runs, notifications
- Horizontal scaling, queues, multiple pm2 instances (scale doc)
- An evaluation harness for match quality
- 2026-10-06 (time cut): discovery uses Greenhouse only; Lever and Ashby move to the design doc as next adapters (narrows D2).

## Notes from the run (2026-10-06)

- Demo submit path: the recorded APPLY NOW jobs (Cloudflare) stay `needs_you` (no resume URL in the seed; a required privacy acknowledgement that D10 never auto-answers). The fixtures-only mode (`JOB_SOURCE=fixtures`) and the E2E test therefore include one clearly labelled synthetic demo board whose form has only standard fields, so D18/D19 can be shown. It is never in the live board registry and the UI labels it "Fixture".
- Demo preset also applies to APPLY and STRETCH (2026-10-07): under "Demo (broadened)", jobs scored APPLY or STRETCH go on to form fill and simulated submit like APPLY NOW, keeping their Verdict; the default preset keeps D8 unchanged. One condition (`appliesTo` in `apps/api/src/evaluation/preferences-preset.ts`); no scoring change.

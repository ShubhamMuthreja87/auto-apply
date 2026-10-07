# Chat 2 — Technical Design Document outline (AI Auto-apply)

- **Tool:** Claude (claude.ai, Project "carrerflow assignment")
- **Date:** 2026-10-07
- **Purpose:** design interview producing the outline for the Technical Design Document (production design of AI Auto-apply)
- **Output:** `tdd-outline.md`

**Notes on this transcript:**
- User and assistant messages are reproduced verbatim.
- Tool calls are summarised in [brackets].
- The project files (the assignment brief PDF and SETUP.md) were attached as context and are not reproduced here. The "Prototype decisions from chat 1" were pasted by the user and are included.

---

## User

I'm doing the Engineering Manager take-home for Careerflow.ai. The brief and SETUP.md are in the project files. I'm submitting tonight. This transcript will be shared with Careerflow as part of my Responsible Use of AI statement.

This chat produces the OUTLINE for the Technical Design Document. It covers the PRODUCTION design of AI Auto-apply, not the prototype. The full document gets drafted in my repo afterwards, so its claims can be checked against the code.

Prototype decisions from chat 1: pasted with this message

How to run this:
- Interview me one question at a time. For each, give your recommended answer and a short reason, then wait for my decision.
- Push back if I'm over-engineering for the stage of the company, or writing something generic that could appear in any design doc. Ask what makes it specific to Careerflow and to auto-apply.
- Aim for roughly 12–18 questions.

Sections the outline must cover:
1. Feature overview: purpose, target users, expected outcomes and how we'd measure them
2. System architecture: components and how they interact
3. AI integration: profile and job-description analysis, application requirements, matching, generated content, guardrails, evaluation
4. Scaling to millions of users: where the load actually is, queues, rate limits against job sources, cost per application
5. Security and compliance: GDPR, PII, consent, acting on a user's behalf, ATS/site terms of service
6. Risk assessment as its own section: for each risk, probability, impact and specific mitigation steps. At minimum cover the five categories the brief names.
7. A short "Prototype vs production" section: where the prototype deliberately differs and why

End with a block titled OUTLINE: section headings, 2–5 bullets of substance per section (decisions, not topics), and a risk table (risk | probability | impact | mitigation). I'll review it here and ask for changes in this chat.

**[Pasted attachment: Prototype decisions from chat 1]**

```
DECISIONS
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
Out of scope
* Real submission to employers (browser workers, extension, employer APIs); Playwright or Hermes experiments come later
* Review mode and approval queue (design doc: launch default)
* Applying through Lever or Ashby, other ATSs, agentic web discovery
* Re-evaluating seen jobs when a posting or the preferences change
* Retry limits, failure triage, human oversight of failures, capturing failures for the eval set
* Guardrails framework, PII redaction pipeline, batching, embedding prefilter, LangChain
* Resume parsing into the profile
* Multi-user support, signup, password reset, roles
* Scheduled or background runs, notifications
* Horizontal scaling, queues, multiple pm2 instances (scale doc)
* An evaluation harness for match quality
Changes to the kit
* Ticket 03 (job source): fixtures-only → live ATS adapters with fixtures as the fake and a per-board fallback.
* Ticket 04 (AI matcher): match-only → rubric evidence extraction plus code scoring, and a fill call; the fallback matcher returns the same rubric shape.
* Ticket 05 (submitter): generic simulated apply → a payload from the merged real question schema, field resolution and the needs_you hold, a deterministic first-submit failure and a retry endpoint.
* Ticket 06 (history and limits): "past runs" → Applied jobs and Scanned jobs views; caps set to 15 evaluations and 3 in flight.
* New tickets: settings page with Firestore-backed profile, preferences and application settings plus first-boot seed; login with JWT cookie, bcrypt and CORS.
* Contract (contract.ts): the new run and job statuses, rubric evidence, verdicts, held reasons and payload types; the guard will ask before each edit.
* Dependency ADR: add jsonwebtoken, bcrypt (or bcryptjs), cookie-parser, cors, nodemon.
* nginx: add a rate-limited /api/auth/login location, and enable the POST /api/runs limit now rather than in section 7.
* CLAUDE.md: the AI provider stays DeepSeek, but add the no-PII-to-model rule and the production-provider note; the architecture guard is unchanged (the browser still never touches Firebase or AI).
* ASSIGNMENT.md: paste in the brief's document requirements, as SETUP.md step 3 says.
```

---

## Assistant

[Read two project memory notes: the Careerflow take-home context and the user's job-search context.]

Good setup. I'll run about 15 questions in section order. I'll push back when something reads as generic or is too heavy for a company at Careerflow's stage. One question at a time.

**Q1 (Feature overview): What is the success metric for auto-apply?**

This answer shapes every later section. If the target is "applications sent", the right design is a firehose. If the target is "interviews", the right design is a filter. Your prototype is already built as a filter: hard blocks, only APPLY NOW auto-submits, and `needs_you` holds. So the doc needs a metric that justifies those choices.

**My recommendation:** make the north star **interviews per user per week**. Back it with **interview rate per submitted application**, and use it as a guardrail metric that must not fall below the user's own baseline from manual applications. Careerflow's tracker board already records outcomes, so it supplies that baseline. Add two quality signals:
- **Override rate:** the share of auto-decisions the user reverses (un-skips, withdraws, edits a payload).
- **Hold-resolution time:** how long `needs_you` items wait before the user answers them.

Report "hours saved" as a secondary benefit, not the goal.

**Reason:** the biggest risk in auto-apply is spray-and-pray. Low-quality volume hurts the user's reputation with employers, and it gets the product blocked by ATSs. A volume metric would push the team straight into that failure. A metric tied to conversion, measured against data Careerflow already collects, is specific to this company. "Saves users time" could go in any design doc.

**Target users, as a sub-point:** existing Careerflow users who already have a resume and a tracker board. They are the cheapest to onboard because the profile already exists. The doc should name the segment applying at volume: active seekers sending 20+ applications a week.

Do you agree with interviews as the north star? And do you have a view on which user segment to lead with?

---

## User

interviews and a golden eval set for the quality of applications going out as well , getting interviews can be an indicator of quality , but tracing back the interview from the platform might be tricky , also many candidates might just fail in the first HR round based on location / salary / key skills (lets say 70% match), then the agent applies but that 30% was the main requirement of the company, so we need to collect this kind of data as well.
Sure , the initial user set can be the active applicants from the platform (as a pilot for free and gather data as well as usage pattern and can be given for 2 week trial or something to upsell later) and this can also be given to passive but paying customer who do 2-3 applications a week , this will help them if they run busy etc. but this is a high churn buisness so , ads and awareness will be necessary

---

## Assistant

Agreed on all of it, with one correction and one cut.

**What goes in the outline:**
- **North star:** interviews per active user per week.
- **Quality guardrail:** a golden eval set of reviewed applications, scored offline before any change to the model, prompt or rubric ships. The details belong in Section 3. Section 1 just names it as the pre-launch quality bar, since interviews come in weeks too late to catch a regression.
- **Attribution:** you're right that it's hard. Name three outcome sources in order of reliability:
  1. Status changes on the tracker board (already in Careerflow, but depends on the user updating it).
  2. Opt-in inbox parsing for ATS replies, which is high signal but adds consent scope (Section 5).
  3. A lightweight check-in after 14 days: "heard back from X?"

  Say plainly that attribution will be incomplete, and that the metric is directional at pilot scale.
- **Rejection-reason capture:** this is the best point so far, and it's specific to auto-apply. The correction: it isn't only a metrics issue, it means the rubric is structurally wrong if it is purely additive. A 70% match that misses the one real must-have is a no, not a 70. So the doc should commit to two things:
  1. Requirements are classified from the JD as must-have or nice-to-have, and a missed must-have caps the verdict regardless of the score.
  2. The stage and reason of each rejection (HR screen: location, salary, key skill) are captured and fed back as new hard blocks and weight changes.

  Your prototype already does hard blocks first, so this extends a decision you've made rather than adding a new one.

**Users:** the pilot is active applicants on a free two-week trial, with passive paying users next. That works, and the two segments want different things. Active users want volume with a floor on quality. Passive users want "never miss a strong match", which fits review mode naturally.

**The cut:** ads, awareness and churn are go-to-market, not technical design. Give them one line at most ("pilot doubles as a conversion funnel; GTM out of scope"). A reviewer looking at an EM's technical doc will read a GTM section as padding.

---

**Q2 (Feature overview → product behaviour): How much autonomy ships at launch?**

Your prototype runs unattended because the brief asks for one button. Decision 1 already says review mode is the launch default, so the doc has to say how a user moves from review to auto.

**My recommendation:** use three per-user autonomy levels.
1. **Review:** the default. The agent finds, scores and pre-fills, and the user approves in a queue. One tap per job.
2. **Auto for APPLY NOW:** unlocked per user once they've approved roughly 20 drafts with a low edit rate, meaning trust is earned from their own override data. Everything below APPLY NOW stays in review.
3. **Never auto,** at any level: legal agreements, consent and demographic questions, employer AI-policy acknowledgements, and any job with an unresolved required field (`needs_you`).

Add a daily cap per user (say 10–15 auto-submits) and an undo window before the actual submit fires.

**Reason:** an application can't be recalled once sent, and it carries the user's name. Earned autonomy turns the override-rate metric from Q1 into a control, not just a dashboard number. The daily cap protects both the user's reputation and Careerflow's standing with ATSs (Section 5). The "never auto" list comes from your live check, where Anthropic's form required an AI-policy acknowledgement and an arbitration agreement. That is concrete evidence, not a hypothetical.

Do you agree with the three levels? Are the unlock threshold and the daily cap numbers you'd stand behind, or should the doc leave them as tunable parameters?

---

## User

1-> i dont think prefill will work like that , the pages and forms may timeout till the user checks and applies after review , the job might stop accepting applications , ofcourse automatic application (user agent is the future), a human review loop can be done for creating an eval set as well , or we can do maybe high confidence jobs as autoapply and the lower confidence ones as a single tap apply . this will also increase the DAU and MAU , since the users will login to actually apply for the jobs which agent didnt apply , we can shoot a mail daily at user's chosen time to tell him the number or jobs agent has figured will be good for him.
2-> we might have enough data from the user to not do this , like i mentioned in the above point , the high confidence roles based on user prefrences can be auto-applied from day 1 , we can do 1 thing , we can do a customer interview on day 1 to gather all the core datapoints for auto-apply and finetune the user profile and prefrences as and when he does more applications . The unique selling point can be agentic job applications , the clients will cross refer to other people only if they see results , trust will be based on results and now the number of applications , but the human thought is counter intuitive , if they see less applications going out they will think that the tool is not working or something is wrong . we need to keep this in mind. so the tool should have both and eventually move to complete automation
3-> we can take these permits from the user beforehand and take the agency from the user if we are going to apply on their behalf , a simple privacy policy and terms and condition will be apt for it , we can take permits for all the major platforms and for the lesser known ones or any new platform we can take permisiions adhoc

a daily cap on auto-apply as well as a daily cap on scan (ai usage is costly and hence scans will be costly), it should be within the cost parameters of the user decided by the buissness , we can add tiering here later ,
keep these as variables , i really like the idea of cancelling an auto-apply , the object to put can be determined , but not filled , if the user has our app on their device we can maybe give a 30 minute window before the form submits on the server , they just have to approve and can set default behaviour as well , like auto approve with timer (if i dont respond for 10 mins auto approve), or add to queue , never auto apply , also these second type of users are the ones whose data we need to add to the eval set and gain the trust

---

## Assistant

Most of this works. I'm pushing back hard on point 3.

**Point 1, accepted with a reframe.** You're right that a review step can't hold a live form open. So in production, "prefill" means a resolved payload stored server-side: field IDs and values, with no browser session behind it. The submit worker only opens the form when the job is approved, and it first checks that the posting is still live and the form schema hasn't changed. If either has changed, the job goes back to evaluation, not to the user. The rest of your point 1 goes in as stated:
- High-confidence matches are auto-applied.
- Lower-confidence matches get one-tap apply.
- A daily digest goes out at the time the user picks.

The doc should say plainly that the digest also drives DAU, because it is product strategy, not just a notification.

**Point 2, accepted.** Auto-apply runs from day one, after a structured onboarding interview. That interview has to collect the must-haves and hard blocks from Q1: location, salary floor, visa, notice period, and deal-breaker skills. Without those, day-one auto-apply means applying from a resume alone, which is how the 70%-match HR rejections happen.

Your point about perception matters, and it belongs in the doc. **The answer is to make the filtering visible, not to send more applications.** Show the funnel on every run and in every digest, for example: "Scanned 240 · 31 relevant · 12 strong · 4 applied · 8 waiting for you." Your prototype already has funnel counts (decision 16), so this extends something you've built. Volume becomes visible without being inflated.

**Point 3, pushback.** A privacy policy plus T&C can authorise Careerflow to act for the user, and you do need that. It cannot make three of these items safe to auto-answer:
1. **Employer AI-policy acknowledgements.** Some of these ask the candidate to confirm they didn't use AI in the application, or that they've read the employer's AI policy. If an agent ticks that box, Careerflow makes a possibly false statement under the user's name. No consent fixes that. These always go to the user.
2. **Demographic and self-ID questions** (race, disability, veteran status). Under GDPR these are special-category data, and they need explicit consent tied to a specific purpose. The safe version: the user optionally pre-answers them once, the answers are stored encrypted as user-provided values, and the agent replays exactly those answers, including "decline to answer". The agent never infers them.
3. **Legal agreements** such as arbitration clauses differ between employers. A blanket pre-acceptance of agreements the user has never seen is a weak position if one is ever challenged. Default to hold, with a one-tap "show me and accept".

The rest of your permissions model works: standing authorisation for known ATS platforms, and ad-hoc permission for new ones.

**Caps and the cancel window, accepted as variables.**
- Two separate per-user daily caps, both set by the business's cost budget per tier: one for scans/AI evaluations and one for submissions.
- Approval mode is a per-user setting with three options:
  - auto-approve after a timer (e.g. 10–30 minutes, with a push notification),
  - add to queue,
  - never auto-apply.
- Whatever users approve, edit, or reject feeds the golden eval set.

---

**Q3 (Architecture): In production, what physically submits the application?**

This is the biggest architecture decision, and the prototype skips it with a simulated submit. As far as I know, Greenhouse's application-submit API is authenticated with the *employer's* job-board key. It's built for companies' own career pages, so Careerflow can't call it for candidates. That leaves three options:

- **A. Server-side browser workers** (headless Playwright, as a pool) fill hosted ATS forms. Fully unattended and works while the user sleeps. Downsides: CAPTCHAs, bot detection, IP reputation, and the most exposure under ATS terms.
- **B. Careerflow's Chrome extension** fills forms in the user's own browser. It runs on the user's IP, in their session, with them present, which means less ToS risk and CAPTCHAs are solved naturally. But it only works while their browser is open.
- **C. Hybrid.** Server workers handle structured ATS forms (Greenhouse, Lever, Ashby, then Workday), and anything that hits a CAPTCHA, login wall or unknown form falls back to the extension or the one-tap queue.

**My recommendation: C**, with two firm rules in the doc:
1. **Never bypass a CAPTCHA or bot-detection.** Hitting one means handing the job to the user, not escalating to a solving service.
2. **Exclude logged-in platforms whose terms prohibit automation** (e.g. LinkedIn Easy Apply). Those jobs are surfaced in the digest for a manual apply.

**Reason:** C delivers the "eventually full automation" you want for most jobs. Most mid-market and startup hiring runs on a handful of ATSs, and the fallback uses an extension Careerflow already ships. The rules keep the company out of an arms race it would lose, both in engineering cost and in standing with ATS vendors. A design doc that waves at "an automation layer" without picking a submit mechanism would be the generic version.

Is C your call? And do you want LinkedIn and Naukri explicitly excluded from automated submission, given your own Hermes setup discovers jobs there?

---

## User

first on your pushback for previous point 3 , we can have different tiers of permissions and store the prefrences of the user , all the legal agreements become one tap show and approve , all the AI-policy related to bot drops entirely and requires human intervention , other prefrences and user data can be securely stored and used for auto applications

your recomendation makes sense , but the idea is for the future where all this will happen agentically , so along with this , maybe use agentic browser control per user basis for auto applications like hermes with browser cli 3 , and in future all the platforms will probably have MCP so , for the platforms already giving this service integrate first and remove the other friction alltogether , the agent might fail sometimes or the pages like greenhouse , lever might be similar and playwright might be a cheaper solution if the structure of the page is fixed , so a hybrid between these should be the case , user browser , server with headless system , agentic , mcp all should work in cohesion , best one picked for the platform / job

---

## Assistant

**Point 3: agreed, and it closes the issue.** The doc will define three permission tiers:
1. **Stored and auto-used:** profile data and standard answers. Encrypted at rest; demographic answers replayed exactly as the user gave them.
2. **One tap, show and approve:** legal agreements.
3. **Always human:** AI-policy and anti-bot attestations, with no automation path at all.

**Q3: right direction, with one pushback on scope.** "All four channels working together, best one picked per job" is the right end state. But a design doc that builds all four at launch is over-engineered for Careerflow's stage. Each channel has its own failure modes, its own cost profile, and its own eval needs. What the doc should commit to is an **interface, a routing policy, and a build order**:

- **Submit-adapter interface.** Every channel takes the same resolved payload (from Q2) and returns the same result: submitted, failed with a reason, or handed to the user. The pipeline never knows which channel ran.
- **Router.** Picks a channel per job using three inputs: platform terms of service, *measured* success rate per platform and channel, and cost per submit. All three are data, not hardcoded preferences.
- **Build order:**
  1. **Deterministic Playwright scripts** for Greenhouse, Lever and Ashby. These have the cheapest, fastest and most testable submits, because form structure is fixed per ATS and your prototype already parses the Greenhouse schema.
  2. **Extension handoff** for CAPTCHAs, login walls and the one-tap queue.
  3. **An agentic browser** as the fallback for unknown forms. It is promoted to primary on a platform only after it beats the fallback on the eval set.
  4. **MCP or API adapters** as platforms ship them. As far as I know, very few ATSs offer candidate-side submission today, so this is a slot in the interface, not a milestone.

Two things the doc has to say about agentic browsers that a generic doc wouldn't:
- **Prompt injection.** An LLM-driven browser reads untrusted page content, such as a job description saying "ignore previous instructions", while it holds the user's PII. The mitigations:
  - The agent only gets the resolved payload, never the full profile.
  - It can only fill and submit, with no navigation off the ATS domain.
  - Its actions are logged.
- **Cost.** An agentic submit can cost 10–50× a scripted one in tokens and time. That is why it falls back rather than leads, and why the router weighs cost.

**LinkedIn and Naukri:** you didn't answer this, so I'll put this in the outline unless you object. They are used for discovery only, excluded from automated submission because of their terms, and surfaced in the digest for a manual apply.

---

**Q4 (Architecture and scale): Is job analysis done per user, or once per job?**

Your prototype discovers and evaluates per run, per user. That's fine at one user. At a million users it means analysing the same Stripe posting a hundred thousand times.

**My recommendation:** split the pipeline at a **shared job catalog**.
- **Global ingestion.** Each board is polled once on a schedule. Postings are normalised and deduped by `ats:board:jobId` (your decision 14), and closed postings are tracked.
- **Analyse each job once.** One AI pass per posting pulls out structured requirements: must-haves vs nice-to-haves, location, salary, visa, seniority, and the form schema. This is where Q1's must-have classification lives.
- **Per-user matching is mostly not AI.** A cheap prefilter (structured fields plus an embedding similarity cut) narrows each user to a shortlist. Only that shortlist reaches the per-user AI evidence call from your prototype.

**Reason:** this changes how cost scales. Job analysis grows with *number of jobs*, which is bounded and shared. Per-user AI grows with *shortlist size*, which the daily scan cap from Q2 controls. Unit cost per user stops growing as the catalog grows, and that's the real answer to "millions of users". It is also the clearest prototype-vs-production difference, and it sets up Section 4 well.

Do you agree with the shared catalog? And should the embedding prefilter be in v1, or come later behind structured filters only? Your prototype ADR lists it as out of scope.

---

## User

4 - totally agreed with your solution , on your previous point , agreed , the object to submit should be same and initial launch might not support all , but we can start with the systems which can give the best results , and eventually expand , so agentic browser goes to next version , chrome extention , playwright stay because the structure more or less is the same for autoapplication , mcp is integrated platform by platform basis and needs regular maintainence when the integrated product publishes breaking changes

side note , how many questions in this chat ?

---

## Assistant

**Side note:** this is Q5 coming up, so four are done. With your deadline tonight, I'd keep it to about 13 total:
- AI integration: 3
- Scale: 2
- Security and compliance: 2
- Risks: 1
- Prototype vs production: 1

Then the outline. If you'd prefer to go shorter, I can fold the risk question into the outline, since your answers have already produced most of the risks.

**Logged:**
- **Q3:** v1 channels are Playwright scripts plus the extension handoff, behind a single payload and result contract. The agentic browser moves to v2. MCP/API adapters get added per platform, each with contract tests against the vendor's schema and pinned versions, so a breaking change shows up in CI instead of as failed submits in production.
- **Q4:** a shared job catalog, with each job analysed once and per-user matching done mostly without AI. You didn't pick on embeddings. I'll write v1 as structured filters only and add the embedding prefilter when shortlists get too long for the scan cap, unless you say otherwise.

---

**Q5 (AI integration): What is the user profile that the AI reasons over?**

The resume is the obvious answer, and it's the weak one. A resume is marketing copy, and it doesn't contain the things HR rejects on: notice period, salary floor, visa, relocation.

**My recommendation:** use a **canonical structured profile** as the single source of truth for both matching and form-filling. It has three parts:
- **Facts:** roles, skills each backed by evidence (where they were used), education.
- **Constraints:** hard blocks and must-haves from the onboarding interview.
- **Standard answers:** notice period, visa, salary expectations, relocation.

**Every field carries a provenance label:**
- **Parsed:** pulled from the resume. Never used for auto-submit until the user confirms it.
- **Confirmed:** the user verified it at onboarding or in settings.
- **Learned:** the user edited a payload answer. The edit is stored as a proposed profile update, and the user is asked to confirm it.

Auto-submit only uses confirmed fields for factual answers. Anything else becomes a `needs_you` hold.

**Reason:**
- It reuses data Careerflow already has: the resume builder's structured resume and the tracker's history.
- It gives your decision 12 ("every answer traces to profile or settings") a mechanism instead of a prompt instruction.
- It turns user edits into profile improvements, which matches the "fine-tune the profile as they apply" idea from Q2.

The generic version would say "we parse the resume with an LLM".

Do you agree with provenance as the gate for auto-submit?

---

## User

agreed with you with respect to needs_you system , but didnt i mention an onboarding interview , that is the place we gather all this data , and cover 90% of the cases , also in future i would like to maybe add a technical and other skill assesment (for jobs other than tech) , this will actually be a better basis for ai to find the job according to the user skill level , and the user can attempt it once a month and improve on the systems , also opens a channel to cross sell upskilling and ai interview prep to the user

---

## Assistant

You did mention it, and I folded the two together badly. The onboarding interview is how the data gets collected. Provenance labels how much each field can be trusted. They fit together this way: the interview starts from resume-parsed values, the user confirms or corrects them, and roughly 90% of the profile is marked *confirmed* before the first run. `needs_you` then handles the remaining 10% (unusual questions specific to one employer), and each answer the user gives there is stored for next time. I'll write it that way.

**Skill assessment: one bullet under future work, with a caveat in the doc.** It's a good future signal, but it should enter the profile as *evidence* labelled `assessed`, which can raise or lower match scores. It should never be a hard block. If an in-house test filters users out of jobs, Careerflow is the one deciding who gets to apply. An assessment that differs from how employers actually screen would cost users real opportunities, and when the assessment is wrong you'd have no outcome data to show it. The upskilling and interview-prep cross-sell is GTM, so it stays out of the technical doc, as with ads in Q1.

---

**Q6 (AI integration): What content does the AI generate, and how do you stop it from making things up?**

This is where auto-apply can do real harm. A made-up claim in a cover letter goes out under the user's name, and nobody reads it before it's sent.

**My recommendation:**
- **Generate only free text:** open-ended form questions ("Why this company?") and cover letters, and only when the form asks for one. Structured and factual fields (years of experience, notice period, salary) are always filled from the profile by code, never by the model. That's your decision 9, now applied in production.
- **Reuse Careerflow's existing cover letter writer** as the generator, so you aren't building a second one.
- **Check every claim before submitting.** A separate verification call extracts each factual claim from the draft and maps it to a profile fact. Any claim it can't trace means one regeneration, then `needs_you`. The pass rate of this check is an evaluation metric.
- **Avoid boilerplate:** answers must be specific to the job description and must not repeat the user's earlier answers word for word. Employers can spot a template, and an identical text sent to 200 companies hurts the user's reputation.
- **Hold if the employer bans AI-written content.** When a posting or form says AI-generated content is not allowed, free-text fields go to the user (this is the permission tier 3 rule).

**Reason:** "every claim traces to a fact" becomes something you can test rather than a line in a prompt. It also covers the "Job Matching Errors" risk from the brief for the content the matcher produces, not just the match itself.

Agree? Do you also want the user's own writing style captured, for example from a sample answer collected at onboarding?

---

## User

on your push back of the previous point the skill assement part was to prevent ai from auto applying on the jobs where the user hasnt been vetted by the ai , for example user says a skill as c# , but we do an assement and figure out the user doenst possess the skill , the user can still apply from the shortlist or on the platform , it wont be autoapplied in the future , this is so that the companies where job posts are living can also be confident on agentic applications from the users.

6-> agreed on all the points , also nothing should be pre generated , it should only generate after the user clicks apply (should not be generated inthe buffer before auto-apply, it will save us tokens in case the user doesnt want to apply ), and based on the job scan done earlier , all the fields are pre known and a langchain call with proper guardrails and dynamic returned object structure will fit here since all the jobs will have different fields , we can add validation from an observer in the agentec workflow who will also do the validation that you talked about

---

## Assistant

**Assessment, accepted. I'd misread it.** Gating *auto*-apply eligibility while leaving manual apply open is a different and much better design. Here's how the doc will put it:
- A skill that fails assessment can't count as evidence toward an auto-apply verdict.
- The job can still appear on the shortlist for one-tap or manual apply.
- An unassessed skill keeps today's behaviour.

The employer-side argument is the strong part and belongs in Section 1: Careerflow becomes a *vetted* channel for agentic applications, not just a volume source. That will matter more as employers start filtering bot-sent applications. It stays a v2 item.

**Q6 additions: two comments.**

1. **Generate on commit, not on click.** "Only generate after the user clicks apply" saves tokens, but it clashes with the timer mode from Q2: the user would approve text they never got to see. The cleaner trigger is to **generate when a job is committed to submit**, either an auto-apply decision or a user tap. That same moment starts the cancel window, so the draft is ready to look at during the window. You keep the saving, because no tokens go to jobs that are only shortlisted, and timer-mode users can still read what's going out.

2. **LangChain, pushback.** Your prototype ADR (decision 25) rejects agent frameworks. A dynamic output shape doesn't change that. The job scan already holds the parsed form schema, so you build a JSON Schema from it at runtime and pass it to the provider's structured output. That's a function of roughly 30 lines, not a framework. The observer is a second schema-bound call, the verifier. If the doc adds LangChain in production, a reviewer will ask why the prototype rejected it. I'd write "runtime schema generation from the parsed form plus a verifier call; no orchestration framework until the v2 agentic browser needs one". That also tells the reader exactly when a framework would become justified. Your call. If you still want LangChain, give me the reason and I'll write it in.

---

**Q7 (AI integration): How is AI quality evaluated, and what blocks a release?**

You named the golden eval set in Q1. This question is about what's in it and what it gates.

**My recommendation:** use three eval sets, one per AI step.
- **Match eval:** labelled user×job pairs, with verdicts from review-mode users' approvals and rejections, the rejection reasons from Q1, and a small set labelled internally.
- **Form-fill eval:** recorded real form schemas with the expected answer for each field. It includes cases that *must* go to the user: AI-policy questions, legal agreements, and unresolved required fields.
- **Generation eval:** the claim-trace pass rate from the verifier, plus a check that answers are specific to the job description.

**Release gate:** any change to the prompt, model, rubric or provider runs offline against all three sets. The key rule is that **APPLY NOW precision must not regress**. Recall can trade down. New models run in **shadow mode** first: they score real jobs next to the live model without acting, and they're promoted only on agreement and precision. Online, track override rate and interview rate split by verdict tier. If APPLY NOW doesn't convert better than one-tap, the tier boundaries are miscalibrated.

**Reason:** the errors aren't equally costly, and that's what makes this specific to auto-apply. A missed match falls into the one-tap queue, so the cost is low and the user can recover it. A wrong auto-apply is irreversible and carries the user's name. Optimising for precision over recall in the auto tier is the main evaluation decision. It also gives a single rule that settles every model-upgrade argument.

Do you agree with precision over recall for the auto tier, and with shadow mode as the promotion path?

---

## User

6 , b -> i removed it from prototype for faster development , by making direct provider call , but in prod when we have user profile embedded in a vector db and jobs are being matched and generated data is coming based on that and this level of guardrails and evals is needed , langchain will be a great solution , we will need to run guarrails on jd's , resume's and outputs ,hence i added it , for demo purposes its an overkill , since this demo is only to show that i can work with code

7-. agreed we can also use the historical data the users filled and cross verify it with model with llm as judge to improve the systems .all other things make sense

---

## Assistant

**6b: accepted, and your reasoning is the right one for the doc.** The prototype has two schema-bound calls. Production has vector retrieval, guardrails at three points (input checks on JDs for prompt injection, PII handling on resumes, output verification) and eval hooks. That amount of plumbing justifies a framework. In the doc, decision 25 becomes a stage decision: "no framework at two calls; adopt at retrieval + three guardrail points". Then the prototype and production stay consistent rather than contradicting each other. I'll also keep the provider-swappable interface underneath it, so the framework doesn't lock in a model vendor.

One update follows from this: you're putting the profile in a vector store in production, so the Q4 prefilter becomes "structured filters + embedding similarity" in the production design. The prototype doesn't do this.

**7: logged, with one caveat on LLM-as-judge.** The judge should be calibrated against the human-labelled subset of the eval set, with its agreement rate reported. Ideally it is also a different model family from the generator. A judge from the same family tends to approve its own mistakes.

---

**Q8 (Scale): Where is the load at a million users, and how do queues and rate limits against job sources work?**

**My recommendation:**
- **Most of the load isn't in the API.** It sits in two places:
  1. Ingestion: polling thousands of boards.
  2. Submit workers: headless browsers, the heaviest unit by far, bound by memory and time.

  The user-facing API stays small.
- **Use one queue per stage:** ingest → analyse → match → generate → submit. Each stage autoscales on its own and has its own dead-letter queue, so a slow ATS backs up only its own submit lane.
- **Rate limit outbound traffic per source:**
  - a token bucket per ATS host and per board,
  - conditional polling (only fetch postings that changed),
  - exponential backoff, and a circuit breaker that serves the last good catalog snapshot when a source fails. That snapshot is the production version of your prototype's fixture fallback.
- **Pace submissions per employer, not only per user.** Spread a company's incoming applications over time. If 400 Careerflow applications reach one Greenhouse board within an hour, that's an employer complaint and a bot-detection trigger, both of which damage the channel for every user.
- **Fair scheduling across users,** with the daily caps from Q2, so heavy users can't starve the submit pool.

**Reason:** "horizontal scaling and a load balancer" would be the generic answer. The real constraint is that Careerflow's throughput is limited by what *external* systems will accept. So the scaling plan is mostly about being polite to ATSs at volume. The per-employer pacing rule exists only because this product acts for many users against the same employers.

Do you agree with per-employer pacing as a first-class limit? Also, any preference on queue infrastructure? Since Careerflow is on Firebase, I'd lean GCP-native: Pub/Sub or Cloud Tasks, with workers on Cloud Run or GKE for the browser pool.

---

## User

1-> ingestion will happen only once , with the latest postings all of them coming in , the ingestion queue makes sense if only api calls are being made , but we discussed other ingestion systems as well. which require headless browser for ingestion as well , also the scans should not be happening every minute , we can poll an api at its rate but we cannot do a headless search every minute , so we need to scale the system when this is happening and one small server can handle 1 browser since we will want different ips for all the boards at every scan , this will help with that , so queues will be a good to have on analyse , match , generate , then submit again faces the same problem , we need headless process with different ips to auto apply as well .
agreed with other points , but we will also need to implement the ratelimits and fallbacks and backoffs on the api calls as well

we should also have limits on per job as well , with the people with the best sematic fit being selected , we cannot allow 400 auto applications on same post even if we have millions of users , it will be bad , this cap can be a variable and depend on platform to platform

---

## Assistant

**API rate limits:** yes, the same limits, backoff and circuit breakers apply to every outbound call, including the LLM provider. I'll make that explicit.

**Browser-based ingestion:** agreed. Ingestion has two lanes:
- **API lane:** polled at each source's allowed rate.
- **Browser lane:** scheduled scans (say a few times a day per source, never every minute), run by short-lived browser workers that scale up for a scan and down to zero afterwards.

One browser per container is the right isolation unit. The doc will say "one browser per ephemeral pod" rather than "per server", because spinning up a pod per scan is cheaper and faster than a server.

**IP rotation, firm pushback.** Rotating IPs so each scan or submit looks like a different client is bot-detection evasion. It's the same category as CAPTCHA solving, which you ruled out in Q3. Three reasons to keep it out of the doc:
1. **Legal and terms risk.** Disguised scraping is exactly what platform terms prohibit, and it's what turns a terms violation into a legal dispute.
2. **It contradicts the doc's own story.** Your assessment idea in Q6 is about making employers *trust* agentic applications. Applications sent from rotating residential proxies say the opposite.
3. **It's an arms race the vendor always wins.** Each time detection improves, you lose a channel overnight.

The legitimate version keeps the isolation without the disguise:
- Each worker gets an isolated browser with no shared cookies.
- Traffic comes from a small, *stable* set of egress IPs, with an honest user agent, inside each source's rate limits.
- Sources that block this go to the extension, where the traffic really is the user's own, from their own IP. That's already the Q3 fallback.

If you disagree, I'd still list IP rotation as a rejected option with this reasoning. A reviewer will think of it, and showing you weighed it and turned it down looks better than leaving it out.

**Per-job cap, accepted. This is one of the strongest ideas in the doc.** It needs two more decisions, though, or the outline will hide a fairness problem:
- **Selection window, not first-come.** Collect eligible users for a window after the posting appears (say 12–24 hours), then fill the auto slots by best semantic fit. Without a window, whoever's run happens first takes the slots.
- **Users who miss out get one-tap.** Users above the bar who don't get an auto slot see the job in their queue with a plain note: "auto-apply slots for this job are full; apply yourself". This only limits *auto*-apply. It never stops anyone from applying.
- **Open business question:** can a paid tier buy priority for slots? I'd say no, because it undermines the "best fit" promise to employers. But it's a product call, so the doc should name it as open, not decide it.

---

**Q9 (Scale): Where does data live, and what does one application cost?**

**My recommendation:**
- **Storage, one store per access pattern:**
  - **Firestore:** user-facing state (profile, runs, applications, statuses). It's already Careerflow's stack, and its listeners give the live UI.
  - **Postgres + pgvector:** the job catalog and matching. Firestore can't do the filtered, ranked queries matching needs.
  - **Object storage:** submitted payloads plus a **screenshot of each filled form before submit**, kept as the audit trail.
  - **BigQuery:** analytics, eval datasets, and outcome attribution.
- **Cost per application as a formula, not a number:** the job's analysis cost (spread across all the users it matched) + the per-user match call + generation and verification (only when a job is committed) + browser-seconds to submit. The doc commits to a **unit budget per tier**. The daily scan and submit caps from Q2 come from that budget, so cost is controlled by design rather than watched after the fact.

**Reason:** the formula shows the two design choices that keep cost down: analysing each job once (Q4) and generating only on commit (Q6). It does this without inventing token prices. The screenshot gives you an answer for when a user says "I never applied there".

Do you agree with the split stores? And do you have a real budget or a price-point figure per tier I should anchor on, or do I leave it as a formula with illustrative ranges marked as estimates?

---

## User

8-> i understand the compliance issue that you are highlighting , but our bot should not be detected is something i feel , because at the moment this system is being planned and made for the future , and ofcourse the compliance will cause issues , we can remove it from the scope , but if buisness needs something like this then we are open to it . ofcourse we can contratually tie up with as many platforms as possible to prevent this

selection window is 1st semantic fit , then from the user pool select the ones with the lower auto applies for today , then determine the cutoff , lets say the cap is 100 , we got a pool of 500 with complete semantic fit , we shortlisted 100 of the ones with minimum number of applications for that day , this seems fair , and an apply button that leads user to the application page is a good choice to hand user the control

add the idea for buisness , i am not very keen on it , as it doesnt make sense at a million user scale , there will still be too many paying customers to promise everyone an application

9-> the cap per user should not exceed 80% of per user subscription per month , so lets say the price is inr 3000 per user per month , the cost should not be more than 80 rs per day (2400/30)
the data storage should be the one which the devs are comfortable with and which satisfies the usecase , the ones you mention are a good fit , keep these ,also add a section for crash and system monitoring

---

## Assistant

**Q8, logged as follows:** v1 makes no attempt to avoid bot detection. The preferred route is contractual partnerships with platforms. Any later change needs legal sign-off first. I'll put that neutrally in the doc rather than as "open if business wants". Remember this document goes to Careerflow, and that phrasing reads as a policy you'd adopt quietly.

**Per-job cap, logged:**
- **Pool:** users whose semantic fit is above the threshold, collected over the selection window.
- **Selection:** fill the cap with the users who have the fewest auto-applies that day. This spreads opportunity and stops heavy users from taking every slot.
- **Everyone else in the pool:** an Apply button that takes them to the employer's application page.
- **Paid priority:** considered and rejected. It can't scale, because at a million users there are too many paying customers to promise each one a slot.

**Monitoring, added as its own section.** Here's what makes it specific to auto-apply:
- **Submit success rate per ATS and channel**, with an alert when it drops. A sudden drop on one ATS usually means its form changed, not that our code has a bug.
- **Canary submits:** scheduled test submissions against a test board we control, so we find out a form broke before users do.
- **Queue depth and the age of the oldest item per stage**, plus alerts on dead-letter queues.
- **Circuit breaker state per source.**
- **AI cost per user against the daily budget.**
- **Tracing across all stages** using run and job IDs.
- **Crash reporting** on workers and the API.

**9, storage: logged as you said.**

**9, budget: pushback.** At ₹3,000 a month, allowing 80% of revenue as variable cost (₹80 a day) leaves a gross margin of about 20%. That margin then has to cover payment fees, GST if the price includes it, support, and acquisition. In a high-churn business with paid ads, which you raised in Q1, 20% doesn't recover what it costs to acquire a user. The fix is to keep two numbers:
- **Hard ceiling, 80% (₹80/day):** a circuit breaker per user. When a user hits it, scanning and generation stop for the day.
- **Target average, roughly 25–30% (about ₹25–30/day):** the number the architecture is designed for. Most users won't use their full caps.

This also strengthens the cost argument: analysing each job once and generating only on commit are what make the target achievable.

Do you agree with ceiling plus target? If so, what target figure do you want?

---

**Q10 (Security and compliance): What personal data leaves Careerflow, to whom, and how is it deleted?**

Careerflow serves users in India, the US and elsewhere, so the doc should name both **GDPR** and **India's DPDP Act**.

**My recommendation:**
- **To the LLM provider:** profile facts and job descriptions only. No name, contact details or address; this is your prototype decision 23, carried into production. The provider needs a data processing agreement, zero data retention, and no training on our data.
- **To employers' ATSs:** exactly the resolved payload for each job and nothing more. The pre-submit screenshot records what was sent.
- **Inside Careerflow:** embeddings built from a profile are personal data too. Deleting an account removes the profile, the embeddings, payloads, screenshots, and the user's rows in the eval set. Eval set inclusion is opt-in and pseudonymised, because review-mode data becomes training material.
- **Retention:** payloads and screenshots are kept for a fixed period (say 12 months, long enough to answer "did I apply there?"), then deleted. Demographic answers are encrypted under a separate key.
- **Legal basis:** processing for auto-apply runs under contract. Demographic data, inbox parsing (from Q1) and eval set inclusion each need separate explicit consent.

**Reason:** the generic version is "encryption, GDPR, audits". What's specific here is that auto-apply sends data to *third parties* (LLMs and every employer) and also creates derived data (embeddings, eval rows). Deletion has to reach all of it, and the doc should say exactly where that data lives.

Do you agree? And is 12 months the right retention period, or do you want it shorter?

---

## User

9-> the ceiling was the max cap i said earlier , but your lower bound makes sense as well
10-> agreed , 12 months seems a long retention period given a scale of a million users and users deleting profiles after getting jobs , so according to compliance lets use the minimum number , if there is no retention cap , still retain it for 3 months and in future versions we can actually use pseudonymised data if the user opts in , to train and improve models or create better eval sets

---

## Assistant

**9, logged:** a hard ceiling of ₹80/day per user, and a design target of about 30% of revenue (roughly ₹30/day).

**10, logged with one correction to the wording.** Neither GDPR nor DPDP sets a *minimum* retention period for this kind of data. Both say to keep it no longer than necessary. So the doc should say:
- **Default:** 3 months for payloads and screenshots, chosen to cover the typical window for hearing back from an employer.
- **Longer only where a specific obligation requires it,** and the obligation is named.
- **Account deletion:** everything is deleted immediately, whatever the retention period.

On training: pseudonymised data is still personal data under GDPR, because it can be re-linked to a person. Only truly anonymised data falls outside it. So the future plan is "opt-in, pseudonymised, and deleted on withdrawal", and it goes under future work.

---

**Q11 (Security and compliance): How does Careerflow act for the user on ATSs that require a candidate account?**

Greenhouse, Lever and Ashby hosted forms don't need an account. Workday, iCIMS, Taleo and SuccessFactors usually make the candidate create an account *for each employer*, with a password. That's a large share of enterprise hiring, and it's the hardest part of acting on someone's behalf.

**My recommendation:**
- **v1 stores no credentials on the server.** Jobs on ATSs that require an account go through the extension. The user is signed in through their own browser and password manager, and the extension fills the form. Careerflow never holds an employer-site password.
- **Later, if business needs it:** server-side account creation with generated per-employer passwords, kept in a dedicated secrets vault encrypted per user. This needs a separate security review, because one breach would expose access to many employer portals for each user.
- **An authorisation record for every submit:** which permission tier allowed it, the approval mode, and the timestamp. Together with the screenshot, this answers "who authorised this application?"
- **A global pause** the user can trigger from any surface. It takes effect immediately, including for jobs already in their cancel window.
- **Responsibility split in the terms:** the user is responsible for the accuracy of their confirmed profile. Careerflow is responsible for submitting exactly what was authorised. Employer replies go to the user's own email; Careerflow doesn't proxy them.

**Reason:** a vault holding many users' passwords for many employer portals would be the most valuable target in the whole system. Leaving it out of v1 removes the largest security risk at almost no product cost, because the extension already covers these sites. The authorisation record and pause turn "acting on a user's behalf" from a policy statement into a mechanism you can check.

Do you agree with no server-side credentials in v1?

---

## User

for v1 agreed , also if the platform needs a user profile to login and apply we cannot create a user profile automatically unless that is what the user demands (highly unlikely ), agreed on the passwords store , then we will also have to keep key rotation and proper IAM for the devs and highest trust auth in this system

---

## Assistant

**Logged:**
- No automatic account creation on any platform. The only exception is an explicit request from the user, made per platform.
- The future credential vault comes with:
  - scheduled key rotation,
  - least-privilege IAM, so no engineer has standing access to the vault,
  - break-glass access that is time-boxed and audited,
  - phishing-resistant MFA (hardware keys) for every admin path.

---

**Q12 (Risk assessment): Do these ratings and mitigations hold up?**

Your earlier answers already produced most of the risks, so here's a draft table to correct rather than a blank question. It covers the brief's five categories plus the auto-apply-specific risks we found along the way.

| # | Risk | Prob. | Impact | Mitigation (summary) |
|---|---|---|---|---|
| 1 | **Matching errors:** auto-apply where the user misses a must-have | High at launch | High | Must-haves classified from the JD cap the verdict; hard blocks run first; precision gate on APPLY NOW; shadow mode for model changes; rejection reasons become new blocks |
| 2 | **Made-up content** in generated answers | Medium | High | Factual fields filled by code only; claim verifier; one regeneration, then `needs_you` |
| 3 | **API limits and reliability** (job sources, LLM) | High | Medium | Token bucket per source; conditional polling; backoff; circuit breaker with last good snapshot; swappable LLM provider plus fallback scoring |
| 4 | **Form or schema changes** break submits | High | High | Schema recheck before submit; alert on success rate per ATS; canary submits; fall back to one-tap |
| 5 | **Platform blocking or terms action** | Medium | High | No detection evasion; pacing per employer; cap per job; partnerships; extension fallback |
| 6 | **Data breach or compliance failure** (GDPR/DPDP) | Low–Medium | Very high | No server-side credentials in v1; data minimised to LLM under a data processing agreement; 3-month retention; deletion reaches embeddings and eval data; least-privilege IAM; audits |
| 7 | **Prompt injection through job descriptions** | Medium | High | Input guardrails on JDs; outputs bound to a schema; the agent sees only the payload and can't leave the ATS domain |
| 8 | **Scalability:** browser pool and ingestion bottlenecks | Medium | Medium | Queue per stage; ephemeral browser pods; shared job catalog; queue depth and age monitoring |
| 9 | **Cost overrun per user** | Medium | High | ₹80/day circuit breaker; 30% design target; analyse each job once; generate only on commit |
| 10 | **UX: users think the tool isn't working** because few applications go out | High | Medium | Visible funnel in the app and digest; `needs_you` lists the exact fields; one-tap apply |
| 11 | **UX: an irreversible wrong submit** | Medium | High | Cancel window; approval modes; global pause; pre-submit screenshot |
| 12 | **Employer backlash** against agentic applications | Medium | High | Cap per job with best-fit selection; skill-assessment gating (v2); partnerships |
| 13 | **Incomplete outcome attribution** misleads metrics | High | Medium | Three outcome sources; metrics treated as directional; eval set as the quality gate before launch |

**My recommendation:** keep all 13. Rows 4, 5, 7, 10 and 12 are the ones a generic doc wouldn't have.

Is there any rating you'd change, any risk to add, or any you'd cut for length?

---

## User

no this works , there might be more risks associated with buisness but we are running out of time , lets finalize this

---

## Assistant

We'll stop here. I've skipped the planned prototype-vs-production question and written Section 8 from your chat-1 decisions, so check that section most carefully. One item is still unconfirmed: you never chose the queue infrastructure, so it's marked as proposed.

[The assistant then produced the full OUTLINE block in chat: Sections 1–8 (Feature overview, System architecture, AI integration, Scaling, Security and compliance, Monitoring and incident response, Risk assessment table, Prototype vs production). This first version matches Sections 1–8 of the exported `tdd-outline.md` word for word, so it isn't repeated here.]

Tell me what to change. When it's settled, you can take this into `/write-deliverable` in the repo.

---

## User

lets move it now , give exportable data

---

## Assistant

[Created `tdd-outline.md` containing the outline above, with a header note attributing decisions to the author and flagging queue infrastructure as unconfirmed, and presented the file.]

Put it in `docs/deliverables/` and point `/write-deliverable 1` at it. A short note at the top attributes the decisions to you and the design interview to this chat, and flags queue infrastructure as still unconfirmed.

---

## User

for the future work also be verbose in the doc , also in the end add the buisness and marketing suggestions we discussed , it will be a good to have , i know it doesnt belong in a tech doc , but i want to show it as well

---

## Assistant

[Edited `tdd-outline.md`. Replaced the short Future work list with Section 9 (9.1 agentic browser channel, 9.2 MCP/API integrations, 9.3 skill assessment and vetted auto-apply, 9.4 server-side applications on account-based ATSs, 9.5 learning loops and model improvement, 9.6 tiering and limits). Added Appendix A: Business and go-to-market notes (launch segments and pilot, engagement and retention, acquisition, positioning, cross-sell, unit economics, considered and rejected). Presented the updated file.]

I've expanded Future work into Section 9 with six subsections. Each one gives what the item is, when it gets built, and what has to be in place first. The business notes are now Appendix A, marked as outside the technical scope, with a line explaining why they're included.

Two things to check before you move it into the repo:
- **Writing-style capture (9.5):** I asked about this in Q6, but you never answered. Remove it if you don't want it.
- **Taxes (A.6):** I mentioned taxes generally without assuming whether the ₹3,000 price includes GST. Change it if you know which.

---

## User

export this chat as a transcript called chat2.md

---

## Assistant

[Created and presented this file, `chat2.md`.]

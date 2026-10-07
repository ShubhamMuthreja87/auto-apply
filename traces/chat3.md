# Chat 3 — Project Plan interview (AI Auto-apply, Careerflow.ai EM take-home)

> Transcript of the planning conversation between Shubham (user) and Claude (Claude Opus 5.5, claude.ai, project "carrerflow assignment"). Shared as part of the Responsible Use of AI statement.
>
> Messages are reproduced as sent. Tool calls Claude made (memory reads, scheduling scripts, Notion writes, file creation) are summarised in *[italic brackets]*; their raw payloads are omitted for length. Project files available to Claude: `SETUP.md` and the assignment PDF.

---

## User

I'm doing the Engineering Manager take-home for Careerflow.ai. The brief and SETUP.md are in the project files. I'm submitting tonight. This transcript will be shared with Careerflow as part of my Responsible Use of AI statement.

This chat produces the project PLAN for building and launching production AI Auto-apply, not tonight's prototype. The deliverable has two parts:
- The written plan, drafted afterwards in my repo with /write-deliverable and exported to PDF. This chat produces the input for it.
- The task-management part: a Notion board (board + timeline views, published link).

Inputs:
Prototype decisions (chat 1):

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

Design doc outline (chat 2, if done):


# Technical Design Document — Outline
## AI Auto-apply (production design)

> Source: design interview with Claude (transcript shared in the Responsible Use of AI statement). Decisions are the author's; Claude proposed options and pushed back where noted in the transcript.
> Scope: the production design. The prototype is covered in Section 8 and the README.
> Open item: queue infrastructure (GCP-native proposed, not confirmed).

---

## 1. Feature overview
- **Purpose:** an agent that finds, scores and applies to jobs for the user. Generic auto-apply tools optimise for volume; this one optimises for interviews. It only applies where the user is a strong fit, and it holds back anything it can't answer truthfully.
- **Users:**
  - **Pilot:** active applicants already on Careerflow, on a free two-week trial. Their resume and tracker data make onboarding cheap.
  - **Next:** passive paying users sending 2–3 applications a week, who want to make sure they never miss a strong match.
- **Product behaviour:**
  - Auto-apply runs from day one for high-confidence matches, after a structured onboarding interview.
  - Lower-confidence matches get one-tap apply.
  - Each user picks an approval mode: auto-approve after a timer, add to queue, or never auto-apply.
  - Every pending submit has a cancel window, and a daily digest goes out at the time the user chooses.
  - Each run and digest shows the funnel (e.g. scanned → relevant → strong → applied → waiting for you), so filtering reads as work being done rather than inactivity.
- **Metrics:**
  - **North star:** interviews per active user per week.
  - **Guardrails:** interview rate per application, compared with the user's own manual baseline; override rate; time to resolve holds.
  - **Pre-launch quality gate:** a golden eval set.
  - **Outcome sources:** tracker status, opt-in inbox parsing, and a 14-day check-in. Attribution is acknowledged as incomplete.
- **Rejection feedback:** each rejection's stage and reason (location, salary, key skill) are captured and become new hard blocks and rubric changes. A 70% match that misses the one real must-have counts as a no.

## 2. System architecture
- **Pipeline:**
  - ingestion (an API lane and a scheduled browser lane)
  - shared job catalog
  - analyse each job once
  - per-user prefilter
  - match
  - generate when a job is committed to submit
  - submit
- **Submit-adapter contract:** every channel takes the same resolved payload and returns one of three results: submitted, failed with a reason, or handed to the user.
  - **v1 channels:** Playwright scripts for Greenhouse, Lever and Ashby, plus a handoff to Careerflow's Chrome extension.
  - **v2:** an agentic browser.
  - **MCP or API adapters:** added platform by platform, with contract tests and pinned versions.
- **Channel router:** picks a channel for each job based on the platform's terms of service, the measured success rate per platform and channel, and the cost per submit.
- **Resolved payload:** stored on the server. The form only opens at submit time, after a check that the posting is still live and the form is unchanged; otherwise the job is re-evaluated.
- **Discovery-only platforms:** LinkedIn, Naukri and similar platforms are used for discovery only. Their jobs are surfaced in the digest with an Apply button that opens the employer's page.

## 3. AI integration
- **Canonical structured profile:** facts with evidence, constraints, and standard answers.
  - Each field carries its provenance: parsed, confirmed, learned, or (v2) assessed.
  - Only confirmed fields can be used for an auto-submit.
  - The onboarding interview confirms about 90% of fields. `needs_you` answers are kept for reuse.
- **Job analysis (once per job):** extracts must-haves vs nice-to-haves, location, salary, visa, seniority and the form schema.
- **Matching:**
  - Code applies the hard blocks.
  - The AI returns per-criterion evidence.
  - Code calculates the score.
  - A missed must-have caps the verdict.
  - In v2, a skill the user failed in the assessment cannot count toward an auto-apply verdict, though manual apply stays open.
- **Generation:**
  - The AI writes free text only, using Careerflow's existing cover-letter writer, and only for jobs committed to submit.
  - Factual fields are always filled by code.
  - The output schema is built at runtime from the parsed form.
  - A verifier call traces every claim back to the profile. If a claim fails, the answer is regenerated once and then held as `needs_you`.
  - Employers' AI-policy statements and other anti-bot attestations always go to the user.
- **Framework and guardrails:**
  - A framework (LangChain) is adopted in production for retrieval and for guardrails at three points: input checks on job descriptions, PII handling on resumes, and output verification.
  - The provider-swappable interface sits underneath it.
  - The prototype skips the framework on purpose, since it makes only two calls.
- **Evaluation:**
  - Three eval sets: match, form-fill (including cases that must hold), and generation.
  - Release gate: precision on APPLY NOW must not regress, while recall may trade down.
  - New models run in shadow mode before promotion.
  - An LLM-as-judge on past user-filled data is calibrated against human labels and uses a different model family from the generator.

## 4. Scaling to millions of users
- **Where the load is:** in browser ingestion and in submit workers, not in the API. Each browser runs in its own short-lived pod. Browser scans run a few times a day; API sources are polled at whatever rate they allow.
- **Queues:** one queue per stage (analyse, match, generate, submit), each with its own dead-letter queue and scaling. Rate limits, backoff and circuit breakers apply to every outbound call, including calls to the LLM.
- **Pacing and caps:**
  - Submissions are paced per employer.
  - Each job has its own cap, set per platform. The users selected for it are those with the strongest semantic fit, gathered over a selection window, with priority to those who have had the fewest auto-applies that day.
  - Everyone else gets an Apply button.
  - Paid priority was considered and rejected.
- **Storage:**
  - Firestore: user-facing state.
  - Postgres with pgvector: catalog and matching.
  - Object storage: payloads and pre-submit screenshots.
  - BigQuery: analytics and evals.
  - Managed queues on GCP-native infrastructure *(proposed, unconfirmed)*.
- **Cost per application:** job analysis spread across the users it matched + match call + generation and verification on commit + browser-seconds.
  - Hard ceiling: ₹80 per user per day (80% of ₹3,000 a month), enforced by a circuit breaker.
  - Design target: about 30% (roughly ₹30 a day).
  - Both daily caps (scans and submits) are derived from this budget.

## 5. Security and compliance
- **Data flows (GDPR and India's DPDP Act):**
  - The LLM receives only profile facts and job descriptions, never name, contact details or address. The provider must sign a DPA and commit to zero retention and no training on our data.
  - Each ATS receives only the resolved payload for that job.
  - Embeddings count as personal data.
- **Retention and deletion:**
  - Payloads and screenshots are kept for 3 months, longer only where a named obligation requires it.
  - Deleting an account immediately removes everything: profile, embeddings, payloads, screenshots and eval rows.
  - Using data for evals or training needs opt-in, is pseudonymised, and is deleted when the user withdraws.
- **Permission tiers:**
  1. Data stored and used automatically. Demographic answers are encrypted under a separate key and replayed exactly as the user gave them.
  2. Legal agreements are shown to the user and accepted with one tap.
  3. AI-policy and anti-bot attestations are always answered by a human.

  Major platforms get standing authorisation; new platforms get ad-hoc authorisation.
- **Acting on the user's behalf:**
  - v1 holds no credentials on the server; ATSs that require an account go through the extension.
  - Accounts are never created automatically unless the user explicitly asks for a specific platform.
  - If a credential vault is added later, it needs key rotation, least-privilege IAM, audited break-glass access, and hardware MFA.
  - Every submit is recorded with who authorised it, plus a global pause.
  - The terms split responsibility: the user owns the accuracy of their profile, and Careerflow owns submitting exactly what the user approved.
- **Platform terms:**
  - No CAPTCHA solving and no bot-detection evasion.
  - Traffic comes from stable egress IPs and stays within rate limits.
  - Contractual partnerships are the preferred route.
  - Any change to this policy needs legal sign-off.

## 6. Monitoring and incident response
- Submit success rate is tracked per ATS and per channel, and alerts fire when it drops (a drop usually means the form changed). Scheduled test submits run against a test board we control.
- For every pipeline stage, we track queue depth, the age of the oldest item, and dead-letter alerts. Each job source's circuit-breaker state is visible.
- AI cost per user is tracked against the daily budget. Tracing runs end to end on run and job IDs. Crash reporting covers both the API and the workers.

## 7. Risk assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| **Matching errors:** auto-apply despite a missed must-have | High at launch | High | Must-haves classified from the job description cap the verdict; hard blocks run first; precision gate on APPLY NOW; shadow mode; rejection reasons become new blocks |
| **Hallucinated content** | Medium | High | Factual fields filled by code only; claim verifier; one regeneration, then `needs_you` |
| **API limits and reliability** (job sources, LLM) | High | Medium | Per-source token buckets; conditional polling; backoff; circuit breaker with last good snapshot; swappable LLM provider and fallback scoring |
| **Form or schema drift** | High | High | Re-check the schema before submit; per-ATS success-rate alerts; canary submits; fall back to one-tap |
| **Platform blocking or terms-of-service action** | Medium | High | No evasion; per-employer pacing; per-job caps; partnerships; extension fallback |
| **Data breach or GDPR/DPDP non-compliance** | Low–Medium | Very high | No credentials in v1; minimised LLM data under a DPA; 3-month retention; deletion reaches all derived data; least-privilege IAM; audits |
| **Prompt injection via job descriptions** | Medium | High | Input guardrails; schema-bound outputs; payload-only agent restricted to the ATS domain |
| **Scalability bottlenecks** | Medium | Medium | Queue per stage; short-lived browser pods; shared job catalog; queue monitoring |
| **Cost overrun** | Medium | High | ₹80/day breaker; 30% design target; analyse each job once; generate only on commit |
| **UX: users think the tool isn't working** | High | Medium | Visible funnel in the app and digest; holds list the specific fields needed; one-tap apply |
| **UX: wrong submit that can't be undone** | Medium | High | Cancel window; approval modes; global pause; pre-submit screenshot |
| **Employer backlash** against agentic applications | Medium | High | Per-job cap with best-fit selection; skill-assessment gating (v2); partnerships |
| **Incomplete outcome attribution** | High | Medium | Three outcome sources; metrics treated as directional; eval set as the launch gate |

## 8. Prototype vs production
- **One unattended run → controlled autonomy.** The prototype runs once without supervision because the brief asks for one button. Production adds approval modes, a cancel window and per-user caps.
- **Per-run, per-user evaluation → shared analysis.** The prototype discovers jobs on each run from about 15 hardcoded boards and evaluates them per user. Production uses a shared catalog where each job is analysed once, with a structured-plus-embedding prefilter.
- **Simulated submit → real submit channels.** The prototype builds the real Greenhouse payload but makes no network call, and includes a deliberate demo failure. Production submits through Playwright and the extension, behind the adapter contract.
- **Bare DeepSeek calls → full production AI stack.** The prototype calls DeepSeek directly, with no framework and a keyword fallback. Production uses a provider under a DPA, a framework with guardrails at three points, a verifier, three eval sets and shadow mode.
- **Single-user setup → multi-store, autoscaled.** The prototype has one user, Firestore only, and pm2 on a single EC2 instance. Production adds the multi-store design, queues per stage and autoscaled browser workers.

## 9. Future work

The long-term direction is full agentic automation. The user sets their profile and preferences once, and the agent handles discovery, decisions and submission across every platform, bringing the user in only for what must stay human: legal agreements and AI-policy attestations. Each item below moves toward that end state without giving up the v1 controls that make it trustworthy.

### 9.1 Agentic browser channel (v2)
- **What it is:** an LLM-driven browser (such as the author's own Hermes and browser-CLI setup) that can complete forms with no fixed script. It covers the long tail of career pages and unknown ATSs that Playwright scripts can't.
- **How it enters the system:** as another channel behind the existing submit-adapter contract. It receives the same resolved payload and returns the same result types, so the pipeline needs no changes.
- **Promotion criteria:** it starts as a fallback only. The router promotes it to primary on a given platform only when it beats the current channel on the form-fill eval set and on live submit success rate, and its cost per submit fits the per-user budget. Scripted submits are expected to stay cheaper wherever forms are stable.
- **Required guardrails:**
  - The agent sees only the resolved payload, never the full profile.
  - It cannot navigate off the ATS domain.
  - Every action is logged, and a screenshot is taken before submit.
  - Input guardrails check page content for prompt injection.
- **Framework:** this is the point where an orchestration framework becomes clearly justified, if it hasn't been adopted already for retrieval and guardrails.

### 9.2 MCP / API integrations, platform by platform
- **Rationale:** as job platforms and ATSs publish candidate-side MCP servers or APIs, an integration removes browser friction completely for that platform. It's the most reliable channel and the cheapest per submit.
- **Approach:**
  - Integrate platforms that already offer this first, ranked by the share of user applications going to each.
  - Add each integration as a submit adapter.
  - Prefer formal partnerships where the platform offers them.
- **Maintenance cost:** each integration is ongoing work. Every adapter gets contract tests against the vendor's schema and pinned versions, so a breaking change fails in CI instead of in production. Every integration also needs an owner on the team.

### 9.3 Skill assessment and vetted auto-apply
- **What it is:** an optional technical skill assessment (and non-technical equivalents for other job families). Users can retake it once a month.
- **How it's used:**
  - Results enter the profile with provenance `assessed`.
  - A skill the user claims but fails cannot count as evidence toward an auto-apply verdict. Jobs that depend on that skill can still appear on the shortlist for one-tap or manual apply.
  - Assessment is a gate on *automation*, never on the user's access to jobs.
  - Unassessed skills keep the v1 behaviour.
- **Why it matters:** it makes Careerflow a *vetted* channel for agentic applications. As employers begin filtering bot-submitted applications, a signal that the candidate was actually assessed on what the agent claimed could be the difference between being accepted and being blocked.
- **Open questions:**
  - How well do assessment results agree with how employers actually screen? Interview outcomes from the tracker can be used to check this.
  - Assessments in each job family need separate bias review.

### 9.4 Server-side applications on account-based ATSs
- **Context:** Workday, iCIMS, Taleo and SuccessFactors usually require a candidate account for each employer. In v1 these go through the Chrome extension, so no credentials are held on the server.
- **Future option:** server-side applications on these platforms using a credential vault. This only happens if the business case is strong *and* the user explicitly asks for account creation on that platform.
- **Requirements before building:**
  - a dedicated secrets vault encrypted per user
  - scheduled key rotation
  - least-privilege IAM with no standing engineer access
  - audited, time-boxed break-glass access
  - phishing-resistant (hardware) MFA on every admin path
  - an independent security review

### 9.5 Learning loops and model improvement
- **Opt-in pseudonymised training data:** users who opt in contribute pseudonymised applications and outcomes to fine-tuning and eval sets. Pseudonymised data is still personal data, so withdrawing consent deletes the user's rows from training and eval sets.
- **Richer rejection signals:** outcome data, including the stage and reason of each rejection, feeds the rubric directly. Must-have weights are learned per role family and per employer, not set by hand.
- **Re-evaluating seen jobs:** jobs are scored again when a posting changes or when the user's preferences or profile change materially. Today a seen job is never re-evaluated.
- **Writing-style capture:** generated free text can match the user's own voice, using sample answers collected at onboarding and edits the user makes to drafts.

### 9.6 Tiering and limits
- **Per-tier caps:** daily scan and submit caps, along with the approval modes on offer, vary by subscription tier. Each tier's limits are derived from its cost budget (ceiling 80% of revenue, design target about 30%).
- **Per-platform caps per job:** tuned from data on employer acceptance and complaints rather than fixed values.

---

## Appendix A — Business and go-to-market notes

*These sit outside the technical design. They're included because they shaped several technical decisions above, and because an EM should be able to connect what gets built to how it earns money.*

### A.1 Launch segments and pilot
- **Pilot:** active applicants already on Careerflow, offered a **free two-week trial**. The pilot has three goals:
  - collect usage patterns and outcome data, which seed the eval set and calibrate the tier thresholds;
  - check that interview rates hold up against users' manual baselines;
  - convert trial users to paid plans.
- **Second segment:** **passive paying users** who send 2–3 applications a week. For them the value is "never miss a strong match when I'm busy", which suits the queue and timer approval modes.

### A.2 Engagement and retention
- **The daily digest drives DAU/MAU.** Sent at a time each user chooses, it reports what the agent found and applied to, and invites the user to one-tap the jobs it held. Users come back to act, not only to read.
- **Perception management.** Users judge the tool by visible activity. When fewer applications go out, they assume something is broken. The funnel shown in every run and digest makes the filtering visible as work done on the user's behalf, so a low number of applications reads as selectivity rather than inactivity.
- **Trust comes from results.** Referrals happen only when users see interviews. The north-star metric (interviews per user per week) is also the growth lever.

### A.3 Acquisition
- Job search is a **high-churn category**: users leave once they get a job. Steady acquisition through ads and awareness campaigns will be needed in addition to referrals.
- The pilot also works as a **conversion funnel**. Trial users who see interviews are the most likely to pay and to refer others.

### A.4 Positioning
- **Agentic job applications as the USP**, with a stated path to full automation over time.
- **Quality over volume:** the per-job caps, best-fit selection and (in future) skill-assessment gating can be presented to *employers* as evidence that applications arriving through Careerflow are vetted. That supports platform partnerships and protects the channel.

### A.5 Cross-sell
- The skill assessment (9.3) creates natural upsell paths. A user who fails or scores weakly on a skill can be offered **upskilling content** and **AI interview prep**. The monthly retake gives a reason to come back and a measurable improvement loop.

### A.6 Unit economics
- **Worked example:** at ₹3,000 per user per month, the hard variable-cost ceiling is **₹80 per user per day** (80% of revenue). The **design target is about 30% (about ₹30 per day)**. The gap leaves room for payment fees, taxes, support and acquisition cost, which matters in a high-churn, ad-driven business.
- **How architecture protects the margin:** analysing each job once and spreading that cost across all matched users, generating text only when a job is committed to submit, and having caps driven by the budget. All three keep average cost well below the ceiling.

### A.7 Considered and rejected
- **Paid priority for per-job auto-apply slots.** Rejected: at a million users there are too many paying customers to promise each one a slot, and it would undermine the best-fit promise made to employers.



How to run this:
- Interview me one question at a time. For each, give your recommended answer and a short reason, then wait for my decision.
- Push back if the team is padded, the timeline is unrealistic in either direction, or the leadership section is generic. Ask how I'd actually run it.
- Aim for roughly 10–15 questions.

The plan must cover:
1. Team: roles, skills, headcount, what's in-house vs borrowed
2. Phases with estimated durations: research, design, implementation, testing, deployment
3. Milestones and a concrete deliverable per phase (prototypes, code reviews, testing reports, launch criteria)
4. Dependencies and the critical path
5. Resources: tools, APIs, AI and infrastructure costs
6. Leadership and execution: moving into execution mode, rituals, decision-making, how the plan adapts when something slips
7. Rollout: beta, guardrails, success metrics and kill criteria

End with two blocks:
- PLAN: the plan, structured by the sections above, detailed enough for /write-deliverable to draft the document from it
- BOARD: the task list for Notion. One row per task: title | phase | owner role | start week | duration | depends on

I'll review both here and ask for changes in this chat. Don't create anything in Notion until I explicitly say so.

---

## Claude

*[Read two project memory files: the Careerflow take-home notes and the user's profile.]*

I'll take this in about 12 rounds, roughly in this order: scope and endpoint, team (size, in-house vs borrowed, your own role), phase durations, critical path, the riskiest dependency, costs, execution rituals, decision rights, slip handling, rollout gates, kill criteria, and board granularity. One at a time.

**Q1. Where does the plan end?**

The design doc describes a lot: v1 channels (Playwright for Greenhouse, Lever and Ashby, plus the extension handoff), approval modes, digest, eval sets, shared catalog, queues, and then all of section 9. The plan needs a defined finish line, or the timeline becomes either fiction or a multi-year roadmap.

**My recommendation:** the plan runs to **general availability of v1**, with two internal gates on the way: an **internal dogfood** (the team plus friendly users) and the **paid-conversion decision after the free two-week pilot**. v1 means:

- Greenhouse, Lever and Ashby submits via Playwright, with the extension handoff for everything else
- Approval modes, cancel window, global pause, daily digest with the funnel
- Onboarding interview producing the confirmed profile
- Shared catalog with analyse-once, a per-stage queue design, and the ₹80/day breaker
- Match and form-fill eval sets as the launch gate (generation eval can be lighter at first)

Everything in section 9 (agentic browser, MCP adapters, skill assessment, credential vault, learning loops, tiering) appears as a **post-GA roadmap** with rough quarters, not as scheduled tasks on the board.

**Reason:** an EM plan is judged on whether the dates are believable. Scheduling v2 work alongside v1 suggests a team that doesn't exist and hides the critical path. Putting it on a separate roadmap still shows the long-term direction your design doc argues for, and lets the timeline answer the question a hiring manager actually asks: "when do real users get value, and what has to be true first?"

Do you agree with GA of v1 as the endpoint, or do you want the plan to stop at the pilot (or to go further)?

---

## User

GA v1 is the endpoint , but we keep on adding platforms and i dont see the guardrails and other systems here , so , yes 1st rollout covers the bare minimum required for the sysem , we can even drop the interview in the 1st phase , if need be

---

## Claude

Agreed, with one correction to my list: guardrails belong in v1, not later. Auto-submitting on a user's behalf without them isn't a bare minimum, it's a liability. So v1's AI layer includes input checks on job descriptions (prompt injection), PII minimisation before the LLM, the claim verifier on generated text, and the hold-to-`needs_you` path. Monitoring (per-ATS submit success, queue health, cost breaker) is v1 as well, since it's how you notice form drift before users do.

On dropping the interview: fine, but something still has to produce **confirmed** fields, because only confirmed fields can be used for auto-submit. My suggested fallback is resume parse plus a single confirmation screen ("here's what we'll submit for you, edit or confirm"), with the conversational interview moved to post-GA. The cost is that the first users will get more `needs_you` holds, which the pilot can measure.

**Recorded:** endpoint is v1 GA. v1 is the bare minimum *including* guardrails and monitoring. The interview is replaced by a parse-and-confirm screen. New platforms are added continuously after GA as adapters.

---

**Q2. The team: roles, headcount, in-house vs borrowed**

**My recommendation:** 4 dedicated engineers plus you, with specialists borrowed for limited periods.

| Role | Count | Owns | Dedicated / borrowed |
|---|---|---|---|
| Backend engineer, pipeline | 1 | Ingestion, shared catalog, queues, dedupe, cost breaker | Dedicated |
| Backend engineer, submit | 1 | Adapter contract, Playwright scripts for 3 ATSs, schema re-check, canary submits | Dedicated |
| AI engineer | 1 | Job analysis, matching, generation, verifier, guardrails, eval sets and harness | Dedicated |
| Frontend engineer | 1 | Parse-and-confirm, approval modes, cancel window, run/funnel view, holds | Dedicated |
| EM (you) | 1 | Plan, decisions, hiring/unblocking, ~30% hands-on (adapter contract, reviews) | — |
| Extension engineer | ~0.3 | Handoff into the existing Chrome extension | Borrowed from extension team |
| Designer | ~0.3 | Onboarding, approval and digest UX | Borrowed |
| DevOps / platform | ~0.25 | Queue infra, IaC, observability | Borrowed |
| Legal / compliance | Ad hoc | DPA with LLM provider, ATS terms review, user terms | Borrowed |
| Labellers | Ad hoc | Golden eval set (~300 jobs labelled) | Borrowed from career coaches / support |

**No dedicated QA:** engineers own tests, the AI engineer owns evals, and the borrowed coaches do pilot acceptance. **No dedicated PM:** a founder or the existing product lead owns pilot cohort selection and pricing.

**Reason:** each dedicated seat maps to one critical-path stream (pipeline, submit, AI, UX), so no one is idle and no stream is left without an owner. Anything with low or uneven load is borrowed. This is what a startup of Careerflow's size can actually staff, and it's honest about the 30% of your time that is hands-on.

Does this match how you'd staff it? In particular, would you have a separate frontend engineer, or have the backend engineers cover the UI?

---

## User

1-> instead of interview we can make a basic form to be filled during signup taking prefrences not usually present in the resume to improve the auto apply rates 

2-> i already know the team size they have , but what you are giving makes sense , also i think the dev work can be streamlined with AI and each person takes lead on a topic(vertical) in the system and becomes the goto and the person responsible for that system in case of breakdowns and is responsible for the internal SLA and minimum uptime , also extention engineer as separate doesnt make sense , we can get one more engineer fullstack who can support the work as well as takes ownership for the extention

---

## Claude

Both recorded.

**Onboarding:** resume parse, plus a short **signup preferences form** for what resumes don't contain: expected salary, notice period, locations and work mode, visa/relocation, deal-breakers (company types, industries), and the standard answers ATS forms keep asking for. The parse is confirmed on the same screen. Together these produce the confirmed fields that auto-submit needs.

**Team:** 5 engineers + you. The fifth is a full-stack engineer who supports the other streams and owns the extension. Each engineer leads a vertical and is its go-to owner, accountable for its internal SLA and uptime.

Two things I'd add so the ownership model holds up in practice:
- **A secondary owner per vertical.** With five people, a single owner is a bus factor of one, and that person can't be on call for their system 24/7. Pair verticals (primary + secondary) and run a weekly off-hours rotation across the team, so the owner is accountable without being permanently paged.
- **Make "AI-streamlined" concrete in the plan.** Reviewers will read it as a claim unless it has mechanisms behind it: a shared AI coding setup (repo skills, architecture hooks, contract guards like your prototype kit), AI first-pass code review with a mandatory human approver, and AI-generated test scaffolds that the vertical owner reviews. It speeds up implementation. It doesn't speed up legal review, eval labelling or the pilot calendar, and the plan should say so.

(If Careerflow's real team is a different size from 5 + EM, tell me and I'll use their number; otherwise the plan states 5 + EM as the assumption.)

---

**Q3. Phases and durations**

**My recommendation:** about **18 weeks to GA**, with phases overlapping wherever the dependencies allow:

| Phase | Weeks | Key deliverable |
|---|---|---|
| 0. Research | 1–2 | ATS form survey (top ~50 employers across the 3 ATSs), legal review of ATS terms started, LLM provider shortlist with DPA, baseline interview rates from tracker data, golden-set labelling started |
| 1. Design | 2–3 | Signed-off design doc, adapter contract, data model, eval spec, UX flows; spike: Playwright submit on our own test Greenhouse board |
| 2. Build, increment 1 | 4–7 | **M1 internal alpha:** Greenhouse end to end, approval queue only (nothing auto-submits), guardrails and verifier in place |
| 2. Build, increment 2 | 8–11 | **M2 feature complete:** Lever + Ashby, extension handoff, approval modes and cancel window, digest, cost breaker, monitoring |
| 3. Test + dogfood | 10–13 | Eval gate passed, security review, load test, dogfood with the team and ~20 friendly users making real submits |
| 4. Pilot | 14–16 | Free two-week trial with ~200 active Careerflow users; go/no-go in week 16 |
| 5. GA | 17–18 | Staged rollout 10 → 25 → 50 → 100% |

**Reason:** the build gets 8 weeks because AI-assisted development compresses it, but the long poles are calendar-bound: the legal/DPA sign-off, ~300 labelled eval jobs, and a pilot that has to run two weeks to observe interview outcomes at all. Putting the alpha at week 7 means real submit behaviour is tested against live forms halfway through, not discovered at the end.

Does 18 weeks feel right to you, or do you want this compressed (e.g. a 12-week version that cuts scope) or stretched?

---

## User

A secondary owner per vertical. -> this will always be the case , also the bugs and issues will be solved by the team in round robin including the ones from the ai engineer's systems , so that everyone is comfortable with each other's code , and all the systems will be developed in cohesion of 2 or more people depending on delivery and the feature size , with one person clearly taking the lead . 

Make "AI-streamlined" concrete in the plan -> we need stnadard practices documented and it should be transferable to new joinees and since the field is evolving daily , this will keep on evolving so every one or two weeks the team interacts on what latest they have seen in AI and present their findings , this is to improve their worflow as well as others, this is good upskilling and teambuiding i did earlier as well 


0-> 1-2 weeks for reaserch that can be done in 2-3 days maximum using ai (please cut your estimate ), think in terms of using ai to fasten the work and getting key data points for making final decisions , not the entire thing being done manually , incase i am missing something , also for the golden dataset , it should be a separate process , apart from the research , and its results are needed after 3 weeks so yes after we figure out what all is needed it can begin but it will happen parallely 

1-> if we move fast the entire v1 plan can be finalized from the EM in 1-2 days and then the data models , contracts, eval spec  work can happen parallely with the engineering teams working  on it in the way that they will develop it , so the high level architecture and overview can be finalized in 1-2 days by me and the key stakeholders , and then low level design for the implementation part can be done in another 2-3 days , to be on the safe side and keep the iteration loops clear lets take maximum 1 week for this , but thats the max cap. with the end result and everything documented , which will help in faster execution 

2.1-> build increment 1 with testing should not take more than 2 weeks (normal sprint time) and this includes time for previous bugs and maintaince of previous systems . since everything is clear to begin with and the AI is setup properly it can be achieved

2.2-> increment 2 + bugs and learnings from increment 1 and testing 2 weeks sprint 

3-> rigorous testing , evals and system improvements should not take more than 1 week , but worst case lets take 2 , this will be lighter workload and resources can be aligned on planning the next featureset here and only the systems which have lower quality need a analysis of why low quality as well as any delays need to be discussed and addressed incase we need to improve systems so that it doesnt happen again nevertheless sprint retrospectives happen after each sprint , but first sprint wont lead to good enough talking points so it happens after 2nd one

4-> 1 week pilot with data gathering and constant observation as well as getinga and saving data for evals , as well as given to current power users of the platform who are hunting jobs religiously currently as a beta and rollback incase of critical failures one week here as a fix and improvement time only if need be very low chance but lets plan for it 

5-> agreed

---

## Claude

All recorded:

- **Ways of working:** every system is built by 2+ people with one clear lead, and the secondary owner is standard. Bugs and incidents go round robin across the whole team, AI systems included, so everyone knows everyone's code.
- **AI practice:** a documented, versioned AI development playbook that's part of onboarding for new joiners. Every 1–2 weeks there's an AI share-out where people present what they've found, and whatever is adopted goes back into the playbook.
- **Retros:** after every sprint from sprint 2 onward.

Revised timeline with your numbers:

| Phase | Weeks | Notes |
|---|---|---|
| 0. Research | W1, days 1–3 | AI-assisted, decision-focused |
| 1. Design | W1–W2 (max 1 week) | HLD in 1–2 days with stakeholders, then LLD, contracts, data model and eval spec in 2–3 days |
| Golden set | W1 (day 4) → W4 | Parallel track, ready for the eval gate |
| 2.1 Sprint 1 | W3–W4 | Increment 1 + testing |
| 2.2 Sprint 2 | W5–W6 | Increment 2 + sprint-1 fixes; first retro |
| 3. Test, evals, hardening | W7 (W8 worst case) | Lighter load; next-feature planning starts |
| 4. Pilot | W8, + W9 fix buffer if needed | Power users as beta; rollback on critical failure |
| 5. GA | W10–W11 | Staged rollout |

**About 11 weeks to GA, 13 in the worst case.** On research I agree completely: most of it is scriptable now. The ATS form survey is just your prototype's `?questions=true` pull run across ~50 boards, terms-of-service summaries can be AI-drafted for legal to review, and the baseline is a single query on tracker data.

Three places where I'm pushing back, because AI can't compress them:

1. **Legal and the LLM provider DPA run on other people's calendars.** Real user data can't reach the model until the DPA is signed, so this gates the pilot. It has to start on day 1, in parallel. Mitigation: shortlist only providers that already offer a standard DPA and zero-retention terms, so this is a signature rather than a negotiation.
2. **A one-week pilot can't measure interviews.** Employers take 1–3 weeks to respond, so the north-star metric won't show up in week 8. The go/no-go has to rest on leading indicators (submit success rate, hold rate, override and cancel rate, verifier failures, user complaints), with the interview-rate check continuing through GA as a kill criterion. I'll draft those in the rollout question.
3. **Sprint 2 is the tightest part of the plan.** Lever + Ashby scripts, extension handoff, approval modes, the digest, the breaker and monitoring in two weeks only works with a pre-agreed cut line. Without one, a slip turns into a slipped date.

---

**Q4. Critical path and the cut line**

**My recommendation:**

**Critical path:** research → HLD → adapter contract + data model → Greenhouse submit end to end (S1) → approval modes + cancel window (S2) → eval gate (needs the golden set) → pilot → GA.

**Parallel tracks that become critical if late:**
- Legal/DPA → blocks the pilot
- Golden set → blocks the eval gate in W7
- Test Greenhouse board we control → blocks canary submits and monitoring

**Off the critical path:** the extension handoff. If it's late, unsupported ATSs just get an Apply button.

**Cut order if sprint 2 slips** (first cut first): Ashby submit → Lever submit → digest reduced to in-app funnel only → extension handoff.

**Never cut:** guardrails and verifier, cancel window, global pause, cost breaker, per-ATS monitoring.

**Reason:** you've already said platforms will keep being added after GA, so platforms are the natural thing to flex. Greenhouse alone is a viable GA. A launch missing the safety controls isn't.

Do you agree with this critical path and cut order? Would you protect anything differently, for example keeping Lever above the digest?

---

## User

agreed , but i think other than greenhouse we should be doing Ashby submit → Lever submit at the same time with one person responsible for it ,that person will create the entire system and its similar work 
also on pilot run can be extended, other things agreed

---

## Claude

Recorded:

- **Lever + Ashby are one unit**, built together in sprint 2 by one owner (the submit-vertical lead, who wrote the Greenhouse adapter in sprint 1). If sprint 2 slips, the unit moves post-GA as a whole, and if only one passes its canary we ship that one. One check for research week: in the prototype, only Greenhouse exposed its form as data. Playwright reads the live DOM, so that isn't a blocker, but the form survey should sample Lever and Ashby forms too so the owner knows how much variance to expect.
- **The pilot is extendable.** I'd make the rule explicit so extension doesn't become a way to defer the decision: extend by one week only when leading indicators are *ambiguous* (not failing), with at most one extension. That puts the worst case at about **14 weeks** to GA.

---

**Q5. Resources: tools, APIs and costs**

**My recommendation:** a line-item budget with order-of-magnitude INR figures, explicitly marked as assumptions to be verified in research week, and tied back to the cost model in the design doc so the numbers are traceable.

| Resource | Choice | Pilot (~200 users, ~3 weeks) | Scales with |
|---|---|---|---|
| LLM API | Provider with standard DPA + zero retention, behind the swappable interface | Ceiling ~₹1.5L (incl. eval and dev runs); breaker-enforced | Users × matched jobs; ≤ ₹30/user/day design target |
| Browser workers | Playwright in short-lived containers (GCP-native) | ~₹20–40k/month | Submits + browser-lane scans |
| Data stores | Firestore (existing), Postgres + pgvector, object storage, BigQuery | ~₹25–40k/month | Catalog size, payload retention (3 months) |
| Queues | Managed, GCP-native *(open item from design doc)* | Small | Stage throughput |
| Observability | Error tracking + tracing + dashboards/alerts | ~₹10–20k/month | Event volume |
| AI dev tools | Coding-assistant team seats for 6 | ~₹50k–1L/month | Headcount |
| Task management | Notion (board + timeline) | Existing | — |
| People, borrowed | Designer ~0.3, DevOps ~0.25, legal ad hoc, coaches ~40h of labelling | Internal time | — |

One resource I'd flag as a **risk rather than a cost**: canary submits need an **ATS job board we control**. Getting one may mean Careerflow's own careers page (if it's on Greenhouse), a vendor sandbox, or a partnership. Research week should establish which, because per-ATS monitoring depends on it.

**Reason:** the brief asks for resource planning, and a reviewer will check whether the numbers connect to your unit economics. Tying the LLM line to the ₹80 ceiling / ₹30 target and the breaker shows that cost is controlled by the architecture, not just estimated.

Are you happy with this level of detail (order-of-magnitude, labelled as assumptions), or do you want harder numbers on specific lines?

---

## User

these numbers are ok , but have you considered that initally the load wont come together so this number might be higher , and the scaling also only happens with load

---

## Claude

You're right, and it's a correction the plan should make explicitly. Two effects make early per-user cost higher:

- **Amortisation needs density.** Analyse-once only saves money when many users match the same job. With ~200 pilot users there's little overlap, so each job's analysis cost is spread over one or two users, not dozens. On top of that, pilot users are power users, so they're heavier than average.
- **Fixed floors don't shrink.** Minimum instances, a database that's always on, observability and dev seats cost the same at 200 users as at 2,000.

How the plan should handle it:
- **Budget the pilot at the ₹80 ceiling, not the ₹30 target.** The LLM ceiling for the pilot becomes about **₹3–3.5L** (200 users × ₹80 × ~21 days), with the breaker still enforcing it per user. Higher per-user cost in the pilot is expected and accepted.
- **Keep infra scale-to-zero by default** (serverless containers, on-demand browser pods, a minimal Postgres tier), so the fixed floor stays small and costs rise only with real load.
- **Track the curve, not just the number.** Report cost per user per day next to **users per analysed job** (the amortisation ratio). The plan's claim becomes: "cost per user trends from near the ceiling toward ₹30 as density grows." The pilot then measures that trend instead of being judged on an unrealistic number.

---

**Q6. Moving into execution mode**

This is where I'd expect a reviewer to look hardest for something generic, so I'd rather ground it in how you actually run teams.

**My recommendation for the first week and the standing rhythm:**

- **Day 1 kickoff (half day):** HLD walkthrough, vertical leads and secondaries named, definition of done agreed (tests, evals where relevant, dashboards for the vertical, runbook entry), the cut line and never-cut list stated out loud, the AI playbook v1 handed over.
- **Standing rituals:**
  - Daily: written async update (yesterday, today, blockers) by 10:00, plus a 15-minute sync only for blockers
  - Weekly: demo of working software from every vertical, plus a 30-minute critical-path review by you
  - Every 1–2 weeks: AI share-out
  - Each sprint: planning on day 1; retro from sprint 2 onward
  - Weekly: one-page stakeholder update (status against milestones, risks, decisions needed)
- **Your own time:** roughly 30% hands-on (adapter contract, cross-vertical reviews, the round-robin bug rotation like everyone else), the rest on unblocking, stakeholders and the next-feature plan from W7.

**Reason:** written async updates fit a small team using AI tooling that works in long focus blocks; the weekly demo forces integration early; and the critical-path review is the mechanism that catches slips (next question).

How did you run this at Digital Paani with your team of 6? What would you keep, drop or change from the above?

---

## User

5-> but initally there might not be these many users as well , so it will grow slowly into this , lets go ahead with a middle path 

6-> daily standup 30 mins 5 mins per person , to tell yesterday , today , blockers , and maximum 30 mins sync between the people responsible for blockers, with unblocking solution posted on group slack for everyone to read so that the unblock doesnt cause another block ,if  i am a blocker then highest priority is unblocked first meanwhile the dev can work on something else. weekly demo per dev , stakeholder update every week or according to SLA , with critical things highlighted earlier to come to better solutions like if we need to cut a feature

---

## Claude

Recorded.

**Budget, middle path:** the pilot starts small and ramps (e.g. ~50 users in the first days, growing toward ~200 as the leading indicators hold). The LLM pilot budget is about **₹2.5L**, with a budget-level alert at 70%, and the per-user ₹80/day breaker stays in force. Infra stays scale-to-zero, so it grows with the cohort.

**Rituals:**
- **Daily standup:** 30 minutes, 5 per person (yesterday, today, blockers).
- **Blocker syncs:** only the people involved, max 30 minutes. The resolution is posted in the team Slack channel so it doesn't create a new block downstream.
- **You as a blocker:** if you're the blocker, unblocking is your top priority, and the dev switches to other work in the meantime.
- **Weekly:** a demo from each dev, and a stakeholder update weekly (or as the SLA requires).
- **Risks surface early**, especially anything that could trigger a cut, so stakeholders help choose the solution rather than hear about a missed date.

One small addition so this doesn't depend on people self-reporting: **a blocker that's still open after one working day escalates to you automatically**, and one still open after two days goes into the stakeholder update. A timebox makes "highlight early" a rule rather than a judgement call.

---

**Q7. Decision rights**

**My recommendation:**

| Decision | Who decides | How |
|---|---|---|
| Inside a vertical (implementation, libraries within the allowlist, internal schema) | Vertical lead | Logged in the decision log; secondary informed |
| Cross-vertical: adapter contract, shared data model, queue interfaces | EM, with the affected leads | Timeboxed to 24h, written up as an ADR |
| Scope cuts within the agreed cut line | EM | Decide the same day; inform stakeholders in the next update |
| Cuts beyond the cut line, a launch-date change, pilot go/no-go | EM recommends, founders/product decide | Raised early, with options and a recommendation |
| Legal, ATS terms, data-handling policy | Legal sign-off required | Never overridden for schedule |
| Disagreements | Whoever owns the decision above | Argue within the timebox, then disagree and commit |

Plus one speed rule: **reversible decisions get made by the owner without a meeting.** Only irreversible ones (contracts other teams build against, data that users will see, anything legal) go through the heavier path.

**Reason:** with five engineers building in pairs, most friction comes from not knowing who decides, not from the decisions themselves. Pushing most decisions down to vertical leads matches the ownership model you described and keeps you out of the critical path.

How do you actually handle it when a strong engineer disagrees with you on a cross-vertical call? Does "argue, then disagree and commit" match what you've done, or do you run it differently?

---

## User

7-> agreed with your proposal , this is standard , i usually understand the problem statement and dont give hard opinions , but  take some time to gather complete context and have a discussion , and the best and most optimized path is chosen , we need to move fast now , running out of time , how many questions are left ?

---

## Claude

Two left, or one if you accept my default for the board:

- **Q8 (below):** rollout gates, success metrics and kill criteria
- **Q9:** board granularity. My default is roughly 40–50 tasks, at about the 1–3 day level, grouped by phase. If that's fine, skip it.

Slip handling is already covered by what you've decided (cut line, never-cut list, 1-day/2-day escalation, early stakeholder flags, the pilot extension rule), so I'll write it up from those. Your decision style is recorded too: gather full context, discuss, then choose the best path, with the decision-rights table as the frame.

---

**Q8. Rollout, guardrails, metrics, kill criteria**

**My recommendation:**

**Stages**
1. **Dogfood (W7):** the team plus ~10 friendly users. Nothing auto-submits; everything goes to the approval queue.
2. **Pilot (W8):** power users, ramping from ~50 to ~200. Auto-submit only on APPLY NOW, with the cancel window. Default approval mode is auto-approve after a timer.
3. **GA (W10–11):** 10 → 25 → 50 → 100%, with each step requiring the gates below to hold for 48 hours.

**Go/no-go gates** (leading indicators, measurable within a week)
- Submit success ≥ 95% per ATS
- Zero factual fields submitted that weren't confirmed by the user
- Cancel + override rate ≤ 10% of auto-submits
- `needs_you` holds resolved within 48h for most users (hold rate tracked, not gated, in the pilot)
- Cost per user per day within the pilot budget curve
- No critical security findings open

**Kill and rollback**
- **Global pause, immediately:** a fabricated claim gets submitted, a data leak, or a platform terms notice or block.
- **Disable that ATS channel, fall back to one-tap:** submit success below 80% on any ATS.
- **Revert the default to approval-only:** after GA, if interview rate per application falls clearly below users' manual baselines over 4–6 weeks.

**Success metrics**
- **North star:** interviews per active user per week, measured post-GA
- **Business:** pilot-to-paid conversion
- **Operational:** time to resolve holds, and the amortisation ratio

**Reason:** the pilot window is too short for interview data, so launch decisions rest on leading indicators, and the lagging north star becomes the post-GA kill criterion. Kill criteria are tied to *actions* (pause, disable a channel, revert the default) rather than "reconsider", which makes them actually usable during an incident.

Accept, or adjust thresholds? And confirm whether I should use the default board granularity, and then I'll produce PLAN and BOARD.

---

## User

8-> agreed , on the systems , we need to understand we might never get enough data for the north star metric ,i have already pointed it out , but sure on the other things 

9-> honestly , 1 ticket should be based on story points and no ticket should take more than 1 day according to me , if the ticket it taking more than that it should be broken down into smaller chunks , i think it follows the fibonacchi rule as well , but nothing more than 1 day long . also consider 5 devs and 30% of my time + buffer for previous bugs and decide on the number

---

## Claude

Recorded. On the north star: the plan will say outright that attribution may never be complete, treat interviews per user as **directional**, and make the post-GA kill criterion rest on proxies with a minimum sample size.

**How I sized the board:**
- **Points scale:** 1 = up to 2h, 2 = up to half a day, 3 = up to 1 day. Anything bigger gets split.
- **Capacity per 2-week sprint:** 5 devs × 10 days = 50 dev-days. Take off 10% for ceremonies and 20% as the bug/maintenance buffer, leaving 35 dev-days, plus about 2 days of your hands-on time. That's roughly **111 points**.
- **Planned commitment: about 85–95 points per sprint** (80–85% load). That works out to about 35 tickets per sprint, and about 130 rows across the whole plan, including borrowed work and gates.

---

## PLAN

### 0. Scope and assumptions
- **Endpoint:** GA of v1. Section 9 of the design doc (agentic browser, MCP adapters, skill assessment, credential vault, learning loops, tiering) is a post-GA roadmap, not scheduled work.
- **v1 includes:**
  - Greenhouse, Lever and Ashby submit via Playwright, plus the Chrome extension handoff
  - Approval modes, cancel window, global pause, daily digest with the funnel
  - Resume parse + signup preferences form + confirmation screen (the conversational interview moves post-GA)
  - Shared catalog with analyse-once, queues per stage, the cost breaker
  - Guardrails: injection checks on job descriptions, PII minimisation, claim verifier, hold to `needs_you`
  - Monitoring and the eval gate
- **New ATS platforms are added continuously after GA** as submit adapters.
- **Team assumption:** 5 engineers + EM. It should be replaced with Careerflow's actual numbers if they differ.

### 1. Team

| Role | Vertical lead for | Secondary on | Notes |
|---|---|---|---|
| Backend: pipeline | Ingestion, catalog, queues, cost breaker, retention/deletion | Monitoring | — |
| Backend: submit | Adapter contract, Greenhouse, Lever + Ashby (one unit), channel router, canaries | Extension | — |
| AI engineer | Analysis, matching, generation, verifier, guardrails, evals | Pipeline | — |
| Frontend | Onboarding, approval modes, cancel window, run/funnel, holds, digest UI | Profile | — |
| Full-stack | Extension (owner), profile service, auth, flags, audit, encryption | Frontend | Supports other streams |
| EM | Plan, decisions, stakeholders, unblocking | — | ~30% hands-on: adapter contract, cross-vertical reviews, bug rotation |

**Borrowed:** designer ~0.3, DevOps ~0.25, legal as needed, career coaches ~40h for golden-set labelling, a product/founder owner for pilot cohort and pricing. No dedicated QA: engineers own tests, the AI lead owns evals, coaches do pilot acceptance.

**Ownership model:**
- Every system is built by 2+ people with one clear lead.
- Every vertical has a primary and a secondary owner.
- The lead owns the vertical's internal SLA and minimum uptime.
- Bugs and incidents are handled round robin across the whole team, AI systems included, so everyone knows everyone's code.
- A weekly off-hours rotation keeps owners accountable without being permanently on call.

**AI-assisted development:**
- A documented, versioned AI development playbook (shared repo skills, architecture hooks, contract guards, AI first-pass code review with a mandatory human approver, AI-generated test scaffolds reviewed by the owner). It's part of onboarding for new joiners.
- An AI share-out every 1–2 weeks: people present what they've found, and what's adopted goes back into the playbook. It doubles as upskilling and team-building.
- AI compresses research and build. It doesn't compress legal review, eval labelling or the pilot calendar.

### 2. Phases, durations, deliverables

| Phase | When | Deliverable / milestone |
|---|---|---|
| 0. Research (AI-assisted, decision-focused) | W1, days 1–3 | Research readout and decision memo: ATS form survey (~50 boards, Lever/Ashby sampled), ATS terms summaries for legal, LLM provider shortlist (DPA, zero retention), baseline interview rates from the tracker, test-board options, cost inputs, extension feasibility |
| 1. Design (max 1 week) | W1 day 4 → W2 day 3 | HLD signed off with stakeholders in 1–2 days; LLD in 2–3 days: adapter contract, data model, queue interfaces, AI schemas, eval spec, guardrails, UX flows, observability plan, AI playbook v1, environments/CI. **M0: execution kickoff** |
| Golden set (parallel) | W1 day 4 → W4 | ~300 jobs labelled (AI pre-labelling + coach confirmation), agreement check, must-hold form cases. **Golden set v1 frozen in W4** |
| Legal (parallel) | W1 → W6 | DPA + zero retention signed, ATS terms sign-off, user terms (responsibility split, consent to automation), privacy notice + retention policy. **Gates dogfood with external users** |
| 2.1 Sprint 1 | W3–W4 | **M1 internal alpha:** Greenhouse end to end, approval queue only, guardrails + verifier, onboarding, run view, pause, audit log. Includes maintenance and bug buffer |
| 2.2 Sprint 2 | W5–W6 | **M2 feature complete:** Lever + Ashby, extension handoff, approval modes and cancel window, digest, retention/deletion, monitoring and canaries, eval runners, shadow mode. First retro |
| 3. Test + evals + hardening | W7 (W8 worst case) | **Testing report:** eval gate results, security review, load test at 10× pilot, E2E across 3 ATSs + extension, runbooks, quality analysis of weak systems. Dogfood with ~10 users. Lighter load; next-feature planning starts. **M3: pilot go/no-go** |
| 4. Pilot | W8 (+W9 fix week if needed; at most one extension week) | Power users, ramped 50 → 200; daily gate review; pilot data captured into eval sets. **M4: pilot readout and GA go/no-go** |
| 5. GA | W10–W11 | 10 → 25 → 50 → 100%, each step holding for 48h. **M5: GA** |

**Total:** about 11 weeks base, 14 worst case (hardening +1, fix week +1, pilot extension +1).

**Code review deliverables:**
- Every PR gets an AI first pass and a human approver.
- EM does cross-vertical reviews of the contract and data model in each sprint.
- Whole-branch review before M3.

### 3. Dependencies and critical path
- **Critical path:** research → HLD → adapter contract + data model → Greenhouse end to end (S1) → approval modes + cancel window (S2) → eval gate → pilot → GA.
- **Parallel tracks that become critical if late:**
  - Legal/DPA → blocks the pilot
  - Golden set → blocks the eval gate in W7
  - Test ATS board → blocks canaries and per-ATS monitoring
- **Off the critical path:** the extension handoff (if late, unsupported ATSs get an Apply button).
- **Cut order if S2 slips:**
  1. The Lever + Ashby unit (built together by one owner) moves post-GA. If only one passes its canary, ship that one.
  2. Digest reduced to in-app funnel only.
  3. Extension handoff.
- **Never cut:** guardrails and verifier, cancel window, global pause, cost breaker, per-ATS monitoring.

### 4. Resources and costs (order of magnitude, verified in research week)

| Item | Choice | Pilot |
|---|---|---|
| LLM API | Provider with standard DPA + zero retention, behind the swappable interface | ~₹2.5L budget (middle path), 70% alert, ₹80/user/day breaker |
| Browser workers | Playwright in short-lived, scale-to-zero containers (GCP-native) | ~₹20–40k/month |
| Data | Firestore, Postgres + pgvector (minimal tier), object storage, BigQuery | ~₹25–40k/month |
| Queues | Managed, GCP-native *(open item)* | Small |
| Observability | Error tracking, tracing, dashboards/alerts | ~₹10–20k/month |
| AI dev tools | Team seats for 6 | ~₹50k–1L/month |
| Task management | Notion (board + timeline) | Existing |
| Test ATS board | Own careers board, vendor sandbox or partnership | To be determined in research; flagged as a risk |

**Cost curve:**
- Early per-user cost sits near the ceiling, because analyse-once needs density (few users share jobs in the pilot, and power users are heavier).
- Fixed floors are kept small by defaulting to scale-to-zero.
- Cost per user per day is reported alongside **users per analysed job** (the amortisation ratio).
- The claim is that cost trends from near ₹80 toward the ₹30 target as density grows.
- The pilot starts small and ramps, so spend grows with the cohort.

### 5. Leadership and execution
- **Moving into execution:**
  - Kickoff after HLD (W2): leads and secondaries named, definition of done (tests, evals where relevant, vertical dashboards, runbook entry), cut line and never-cut list stated, AI playbook v1 handed over.
  - The design phase ends with everything documented so execution starts without open questions.
- **Rituals:**
  - **Daily standup:** 30 minutes, 5 per person (yesterday, today, blockers).
  - **Blocker syncs:** only the people involved, max 30 minutes. The resolution is posted in the team Slack channel so it doesn't cause a new block downstream.
  - **EM as a blocker:** if the EM is the blocker, unblocking comes first, and the dev switches to other work meanwhile.
  - **Weekly:** a demo from each dev, and the stakeholder update (or as the SLA requires).
  - **Every 1–2 weeks:** AI share-out.
  - **Each sprint:** planning; retros from sprint 2 onward.
- **Decision-making:** the EM gathers full context, discusses, and chooses the best path rather than starting from a fixed opinion.

| Decision | Owner | How |
|---|---|---|
| Inside a vertical | Vertical lead | Decision log; secondary informed |
| Cross-vertical (contract, shared data model, queue interfaces) | EM with affected leads | 24h timebox, ADR |
| Cuts within the cut line | EM | Same day; stakeholders informed |
| Cuts beyond the cut line, date changes, go/no-go | EM recommends; founders/product decide | Raised early with options |
| Legal, ATS terms, data policy | Legal sign-off | Never overridden for schedule |

Reversible decisions are made by the owner without a meeting. Disagreements are argued within the timebox, then disagree and commit.

- **When something slips:**
  - A blocker open for more than 1 working day escalates to the EM; after 2 days it goes into the stakeholder update.
  - Weekly critical-path review.
  - Risks that could trigger a cut are raised before the date is missed, so stakeholders help choose the solution.
  - The cut order above is applied the same day it's triggered.
  - No adding people mid-sprint.
  - Pilot extension only when indicators are ambiguous, maximum one week.
  - Slips and low-quality systems are analysed in the hardening week and in retros, to fix the cause, not just the instance.

### 6. Rollout, guardrails, metrics, kill criteria
- **Stages:**
  1. Dogfood (W7): team + ~10 users, approval queue only.
  2. Pilot (W8): power users ramping 50 → 200; auto-submit only on APPLY NOW, with the cancel window; default mode is timer auto-approve.
  3. GA (W10–11): 10 → 25 → 50 → 100%, each step with a 48h hold.
- **Go/no-go gates:**
  - Submit success ≥ 95% per ATS
  - Zero unconfirmed factual fields submitted
  - Cancel + override rate ≤ 10% of auto-submits
  - Holds resolved within 48h for most users (hold rate tracked)
  - Cost within the pilot budget curve
  - No open critical security findings
- **Kill and rollback:**
  - **Global pause, immediately:** a fabricated claim is submitted, a data leak, or a platform terms notice or block.
  - **Disable that ATS channel, fall back to one-tap:** submit success below 80% on any ATS.
  - **Revert the default to approval-only:** after GA, if interview rate per application is clearly below users' manual baselines over 4–6 weeks, given a minimum sample. Without enough data, the decision uses proxies (employer response rate, 14-day check-in outcomes), never the north star alone.
- **Metrics:**
  - North star: interviews per active user per week, **directional only**, since attribution may never be complete
  - Business: pilot-to-paid conversion
  - Operational: submit success per ATS, override/cancel rate, time to resolve holds, cost per user per day, amortisation ratio

### 7. Post-GA roadmap (not scheduled)
- Additional ATS adapters, continuously
- Conversational onboarding interview
- Agentic browser channel
- MCP/API adapters
- Skill assessment
- Re-evaluating seen jobs
- Learning loops
- Tiering
- Credential vault (only if the business case and explicit user request justify it)

---

## BOARD

**Points:** 1 = up to 2h, 2 = up to half a day, 3 = up to 1 day. **Owners:** PL = pipeline lead, SB = submit lead, AI, FE, FS = full-stack/extension lead, EM, plus borrowed roles. Buffers are reserved capacity, not tickets.

| ID | Task | Phase | Owner | Wk | Pts | Depends on |
|---|---|---|---|---|---|---|
| R1 | ATS form survey script (~50 GH boards, sample Lever/Ashby) | Research | SB | 1 | 3 | — |
| R2 | Form variance report (field types, off-question required fields, attestations) | Research | SB | 1 | 2 | R1 |
| R3 | AI-drafted ATS terms summaries for legal | Research | EM | 1 | 2 | — |
| R4 | LLM provider shortlist (DPA, zero retention, cost, JSON reliability) | Research | AI | 1 | 3 | — |
| R5 | Baseline manual interview rates from tracker | Research | FS | 1 | 2 | — |
| R6 | Test ATS board options | Research | EM | 1 | 1 | — |
| R7 | Token and cost inputs from prototype runs | Research | AI | 1 | 2 | R4 |
| R8 | Extension handoff feasibility | Research | FS | 1 | 2 | — |
| R9 | Research readout + decision memo | Research | EM | 1 | 2 | R2–R8 |
| D1 | HLD sign-off with stakeholders | Design | EM | 1 | 3 | R9 |
| D2 | Execution kickoff (owners, DoD, cut line) | Design | EM | 2 | 1 | D1 |
| D3 | Adapter contract spec | Design | SB + EM | 2 | 3 | D1 |
| D4 | Data model (catalog, user state, evaluations, seen jobs) | Design | PL | 2 | 3 | D1 |
| D5 | Queue/stage interfaces, DLQ, retry policy | Design | PL | 2 | 3 | D1 |
| D6 | AI schemas (analysis, match, generation, verifier) | Design | AI | 2 | 3 | D1 |
| D7 | Eval spec + gate thresholds | Design | AI | 2 | 2 | D1 |
| D8 | Guardrails design | Design | AI | 2 | 2 | D6 |
| D9 | UX flows (prefs form, confirm, approvals, cancel, funnel, holds) | Design | Designer + FE | 2 | 3 | D1 |
| D10 | Observability plan | Design | DevOps + PL | 2 | 2 | D5 |
| D11 | AI dev playbook v1 + repo skills/hooks | Design | EM | 2 | 3 | D1 |
| D12 | Environments, IaC, CI | Design | DevOps + FS | 2 | 3 | D1 |
| D13 | LLD sign-off, S1 tickets groomed | Design | EM | 2 | 2 | D3–D12 |
| G1 | Golden set sampling plan | Golden set | AI | 1 | 2 | R2 |
| G2 | AI pre-labelling pipeline | Golden set | AI | 2 | 3 | G1, D7 |
| G3 | Coach labelling batch 1 (60) | Golden set | Coaches | 3 | 3 | G2 |
| G4 | Coach labelling batch 2 (60) | Golden set | Coaches | 3 | 3 | G2 |
| G5 | Coach labelling batch 3 (60) | Golden set | Coaches | 3 | 3 | G2 |
| G6 | Coach labelling batch 4 (60) | Golden set | Coaches | 4 | 3 | G2 |
| G7 | Coach labelling batch 5 (60) | Golden set | Coaches | 4 | 3 | G2 |
| G8 | Must-hold form-fill cases | Golden set | AI | 3 | 2 | R2 |
| G9 | Agreement check + adjudication | Golden set | AI | 4 | 2 | G3–G7 |
| G10 | Golden set v1 frozen | Golden set | AI | 4 | 1 | G8, G9 |
| L1 | Initiate LLM DPA + zero retention | Legal | Legal | 1 | 1 | R4 |
| L2 | ATS terms review sign-off | Legal | Legal | 2 | 3 | R3 |
| L3 | User terms (responsibility split, automation consent) | Legal | Legal | 3 | 3 | D1 |
| L4 | Privacy notice + retention policy | Legal | Legal | 4 | 3 | D4 |
| L5 | DPA signed (gate for external dogfood) | Legal | Legal | 6 | 1 | L1 |
| S1-01 | Greenhouse ingestion worker | Sprint 1 | PL | 3 | 3 | D4, D5 |
| S1-02 | Catalog upsert + dedupe by ats:board:jobId | Sprint 1 | PL | 3 | 3 | S1-01 |
| S1-03 | Analyse queue + worker | Sprint 1 | PL | 3 | 3 | D5 |
| S1-04 | Per-user prefilter (hard blocks) | Sprint 1 | PL | 3 | 3 | S1-02 |
| S1-05 | Match queue + worker | Sprint 1 | PL | 4 | 2 | S1-04 |
| S1-06 | Per-source rate limit, backoff, circuit breaker | Sprint 1 | PL | 4 | 3 | S1-01 |
| S1-07 | Cost meter + per-user breaker | Sprint 1 | PL | 4 | 3 | S1-03 |
| S1-08 | Run/job state writes for UI | Sprint 1 | PL | 4 | 2 | S1-05 |
| S1-09 | Job analysis prompt + schema | Sprint 1 | AI | 3 | 3 | D6 |
| S1-10 | Per-criterion match call + validation | Sprint 1 | AI | 3 | 3 | D6 |
| S1-11 | Scoring + verdict in code (must-have cap) | Sprint 1 | AI | 3 | 2 | S1-10 |
| S1-12 | Injection checks on job descriptions | Sprint 1 | AI | 3 | 3 | D8 |
| S1-13 | PII minimisation before LLM | Sprint 1 | AI | 4 | 2 | D8 |
| S1-14 | Free-text generation via cover-letter writer | Sprint 1 | AI | 4 | 3 | D6 |
| S1-15 | Claim verifier + regenerate once + needs_you | Sprint 1 | AI | 4 | 3 | S1-14 |
| S1-16 | Eval harness skeleton (APPLY NOW precision) | Sprint 1 | AI | 4 | 3 | D7 |
| S1-17 | Adapter contract implementation + contract tests | Sprint 1 | SB | 3 | 3 | D3 |
| S1-18 | Greenhouse form resolver (merged sections) | Sprint 1 | SB | 3 | 3 | R2, D3 |
| S1-19 | Field source resolution (profile/settings/AI/user-only) | Sprint 1 | SB | 3 | 3 | S1-18 |
| S1-20 | Pre-submit liveness + schema-unchanged check | Sprint 1 | SB | 4 | 2 | S1-18 |
| S1-21 | Greenhouse Playwright submitter (flagged, test board) | Sprint 1 | SB | 4 | 3 | S1-17, S1-19 |
| S1-22 | Pre-submit screenshot + payload storage | Sprint 1 | SB | 4 | 2 | S1-21 |
| S1-23 | Submit queue + per-employer pacing | Sprint 1 | SB | 4 | 3 | S1-21, D5 |
| S1-24 | Resume parse + confirm screen | Sprint 1 | FE | 3 | 3 | D9 |
| S1-25 | Signup preferences form | Sprint 1 | FE | 3 | 3 | D9 |
| S1-26 | Approval queue UI + payload view | Sprint 1 | FE | 3 | 3 | D9, S1-08 |
| S1-27 | Run view with live funnel | Sprint 1 | FE | 4 | 3 | S1-08 |
| S1-28 | Holds view + reusable answers | Sprint 1 | FE | 4 | 3 | S1-15 |
| S1-29 | Auth/session with Careerflow accounts | Sprint 1 | FS | 3 | 2 | D12 |
| S1-30 | Profile service with provenance + confirmed fields | Sprint 1 | FS | 3 | 3 | D4 |
| S1-31 | Global + per-user pause | Sprint 1 | FS | 4 | 2 | S1-23 |
| S1-32 | Submit audit log (who authorised) | Sprint 1 | FS | 4 | 2 | S1-23 |
| S1-33 | End-to-end tracing + crash reporting | Sprint 1 | FS + DevOps | 4 | 2 | D10 |
| S1-34 | Cross-vertical reviews (contract, data model) | Sprint 1 | EM | 3 | 3 | S1-17 |
| S1-35 | M1 internal alpha demo | Sprint 1 | EM | 4 | 1 | S1-01–S1-33 |
| S1-BUF | Bug/maintenance buffer (~20%, ~10 dev-days) | Sprint 1 | All | 3 | — | — |
| S2-01 | Lever + Ashby ingestion | Sprint 2 | PL | 5 | 3 | S1-01 |
| S2-02 | Lever form resolver (DOM) | Sprint 2 | SB | 5 | 3 | S1-17 |
| S2-03 | Lever Playwright submitter | Sprint 2 | SB | 5 | 3 | S2-02 |
| S2-04 | Ashby form resolver (DOM) | Sprint 2 | SB | 5 | 3 | S1-17 |
| S2-05 | Ashby Playwright submitter | Sprint 2 | SB | 6 | 3 | S2-04 |
| S2-06 | Lever/Ashby contract tests + canary scripts | Sprint 2 | SB | 6 | 3 | S2-03, S2-05 |
| S2-07 | Channel router v1 (fallback to one-tap) | Sprint 2 | SB | 6 | 2 | S2-06 |
| S2-08 | Extension: receive resolved payload | Sprint 2 | FS | 5 | 3 | S1-17, R8 |
| S2-09 | Extension: autofill + report result | Sprint 2 | FS | 5 | 3 | S2-08 |
| S2-10 | Unsupported ATS → Apply button flow | Sprint 2 | FS | 6 | 2 | S2-07 |
| S2-11 | Approval modes settings | Sprint 2 | FE | 5 | 3 | S1-26 |
| S2-12 | Cancel window UI + countdown | Sprint 2 | FE | 5 | 2 | S2-11 |
| S2-13 | One-tap apply for APPLY tier | Sprint 2 | FE | 5 | 2 | S1-26 |
| S2-14 | Daily digest with funnel at user's chosen time | Sprint 2 | FE | 6 | 3 | S2-17 |
| S2-15 | Global pause UI | Sprint 2 | FE | 6 | 1 | S1-31 |
| S2-16 | Timer auto-approve scheduler honouring cancel | Sprint 2 | PL | 5 | 3 | S2-11 |
| S2-17 | Digest scheduler | Sprint 2 | PL | 5 | 2 | S1-08 |
| S2-18 | DLQ handling + replay tooling | Sprint 2 | PL | 5 | 3 | S1-03 |
| S2-19 | Retention job (3 months) | Sprint 2 | PL | 6 | 2 | L4 |
| S2-20 | Account deletion across all derived data | Sprint 2 | PL | 6 | 3 | D4 |
| S2-21 | Form-fill eval runner (incl. must-hold) | Sprint 2 | AI | 5 | 3 | G8, S1-16 |
| S2-22 | Generation eval + LLM judge (different model family) | Sprint 2 | AI | 5 | 3 | S1-16 |
| S2-23 | Shadow-mode harness | Sprint 2 | AI | 6 | 3 | S1-16 |
| S2-24 | Fallback scoring on AI failure | Sprint 2 | AI | 6 | 2 | S1-11 |
| S2-25 | Prompt/schema tuning from S1 evals | Sprint 2 | AI | 6 | 3 | S1-16 |
| S2-26 | Per-ATS submit success dashboard + alerts | Sprint 2 | PL + DevOps | 6 | 2 | S1-33 |
| S2-27 | Queue depth, oldest item, DLQ alerts | Sprint 2 | PL + DevOps | 6 | 2 | S2-18 |
| S2-28 | Cost per user + amortisation ratio dashboard | Sprint 2 | PL | 6 | 2 | S1-07 |
| S2-29 | Scheduled canary submits on test board | Sprint 2 | SB | 6 | 2 | R6, S1-21 |
| S2-30 | Demographic answers under separate key | Sprint 2 | FS | 5 | 3 | S1-30 |
| S2-31 | Feature flags + % rollout control | Sprint 2 | FS | 6 | 2 | D12 |
| S2-32 | Cross-vertical reviews | Sprint 2 | EM | 5 | 3 | S2-07 |
| S2-33 | M2 feature-complete demo + retro | Sprint 2 | EM | 6 | 1 | S2-01–S2-31 |
| S2-BUF | Bug/maintenance + S1 learnings buffer | Sprint 2 | All | 5 | — | — |
| T1 | Eval gate: match (APPLY NOW precision) | Hardening | AI | 7 | 2 | G10, S2-25 |
| T2 | Eval gate: form-fill + generation | Hardening | AI | 7 | 2 | S2-21, S2-22 |
| T3 | Security review + fix triage | Hardening | FS + EM | 7 | 3 | S2-33 |
| T4 | Load test at 10× pilot | Hardening | PL | 7 | 3 | S2-33 |
| T5 | E2E suite on staging (3 ATSs + extension) | Hardening | SB | 7 | 3 | S2-33 |
| T6 | Runbooks + on-call rotation | Hardening | EM | 7 | 2 | S2-26, S2-27 |
| T7 | Quality analysis of weak systems/delays | Hardening | Leads | 7 | 2 | T1–T5 |
| T8 | Dogfood onboarding (~10 users) | Hardening | FE | 7 | 2 | L5, S2-33 |
| T9 | Dogfood daily review + fixes | Hardening | All | 7 | 3 | T8 |
| T10 | Next-feature planning (post-GA roadmap) | Hardening | EM | 7 | 2 | — |
| T11 | M3 pilot go/no-go | Hardening | EM | 7 | 1 | T1–T9 |
| P1 | Pilot cohort selection + comms | Pilot | EM + Product | 8 | 2 | T11 |
| P2 | Ramp 50 → 200 via flags | Pilot | FS | 8 | 1 | P1, S2-31 |
| P3 | Daily gate review | Pilot | EM | 8 | 1 | P2 |
| P4 | Capture opt-in pilot data into eval sets | Pilot | AI | 8 | 3 | P2 |
| P5 | In-app feedback + 5 user interviews | Pilot | Designer + FE | 8 | 2 | P2 |
| P6 | M4 pilot readout + GA go/no-go | Pilot | EM | 8 | 2 | P3–P5 |
| P7 | Fix week (conditional) | Pilot | All | 9 | — | P6 |
| GA1 | Rollout 10% + 48h gate | GA | FS | 10 | 1 | P6 |
| GA2 | Rollout 25% | GA | FS | 10 | 1 | GA1 |
| GA3 | Rollout 50% | GA | FS | 11 | 1 | GA2 |
| GA4 | Rollout 100% (M5) | GA | FS | 11 | 1 | GA3 |
| GA5 | Post-GA dashboard: north star + proxies | GA | AI + FS | 10 | 2 | P6 |
| GA6 | Launch comms + support playbook | GA | EM | 10 | 2 | P6 |
| GA7 | Post-GA retro + roadmap handoff | GA | EM | 11 | 1 | GA4 |

For the Notion timeline view, each row's date range comes from its start week plus its points (1 = ¼ day, 2 = ½ day, 3 = 1 day); the golden set and legal rows also carry their waiting time between tickets. Tell me what to change. I won't touch Notion until you say so.

---

## User

i am running out of time now , make the notion thing and meanwhile export all the decisions in this chat as md file as well for the doc development

---

## Claude

*[Tool activity, summarised:*
- *Loaded the Notion connector tools.*
- *Wrote a small Python scheduler in the sandbox: it encodes the 132 board rows, orders them by dependencies and start week, and assigns each lead a capacity of 3 points per day, with Week 1 starting Monday 12 Oct 2026.*
- *The first runs pushed several AI-lead tickets out of their sprint. To fix this, it moved golden-set and two AI tickets onto paired owners (full-stack, submit lead, EM), made DevOps the lead on tracing and alert tickets, and let three frontend tickets depend on the data model and AI schemas instead of finished backend tickets. It re-ran until every sprint ticket finished inside its sprint.*
- *Created a private Notion page "AI Auto-apply — Project Plan & Task Board" with a short overview (timeline, team, points scale, owner codes, milestones, date assumption).*
- *Created the database "Auto-apply v1 tasks" under it with fields Task, Ticket, Phase, Owner, Pairs with, Start week, Points, Depends on, Start, End, Status.*
- *Added all 132 rows in two batches. It also hand-spaced the GA rollout steps 48h apart and stretched the pilot gate review across the pilot week.*
- *Added a "Board by phase" view (grouped by Phase, sorted by Start) and a "Timeline" view (Start → End).*
- *Wrote `project-plan-decisions.md`: a 27-row decision log with the pushback noted on each, the full PLAN, and a section listing the board adjustments made during scheduling.]*

The Notion board and the decisions export are both done.

**Notion:** [AI Auto-apply — Project Plan & Task Board](https://app.notion.com/p/3f21ca28f8dd81cfb342c1f213cf3b56)
- It has a short overview and the **Auto-apply v1 tasks** database with all 132 rows.
- There are two views: **Board by phase** and **Timeline** (Start → End).
- Each row carries owner, pairs-with, points, start week, depends-on, and illustrative dates starting Monday 12 Oct 2026.
- **The page is private, so you need to publish it yourself:** Share → Publish on the parent page, then copy the link. I can't publish from here.

**`project-plan-decisions.md`** (below) has the 27 decisions in interview order, with the pushback noted on each, plus the full PLAN, structured for `/write-deliverable`.

To keep each lead within capacity, I rebalanced some tickets while scheduling. They're listed in section 8 of the file so you can approve or revert them:

- **Golden-set and some AI tickets were moved off the AI lead.** The AI lead was overloaded in weeks 2–4, so the full-stack engineer and the submit lead pair on that work instead.
- **The frontend tickets are built against contracts, not finished backend work.** Without this, sprint 1 would have spilled into week 5.
- **GA rollout steps are spaced 48h apart.** This matches your gate rule.

---

## User

export this chat as a transcript called chat3.md

---

## Claude

*[Assembled this transcript from the conversation and saved it as `chat3.md`.]*

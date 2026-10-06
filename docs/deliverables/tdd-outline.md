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

# AI Auto-apply — Project Plan: Decisions Export

> Source: planning interview with Claude (transcript shared in the Responsible Use of AI statement). Decisions are the author's; Claude proposed options with a recommendation and pushed back where noted. Input for `/write-deliverable` (Implementation Roadmap and Project Plan).
>
> Task board: Notion database "Auto-apply v1 tasks" (board-by-phase and timeline views), 132 rows.

---

## Decision log (in interview order)

| # | Topic | Decision | Pushback / refinement during the interview |
|---|---|---|---|
| 1 | Endpoint | The plan runs to **GA of v1**. Section 9 of the design doc is a post-GA roadmap, not scheduled work. New ATS platforms are added continuously after GA as adapters. | Author: v1 is the bare minimum, **including guardrails and monitoring** (Claude's first scope list had left them implicit). |
| 2 | Onboarding | The conversational interview is dropped from v1. Replaced by **resume parse + a short signup preferences form** (expected salary, notice period, locations and work mode, visa/relocation, deal-breakers, standard ATS answers) + a confirmation screen. Together these produce the confirmed fields auto-submit needs. | Claude: something must still produce *confirmed* fields; expect more `needs_you` holds early, which the pilot measures. |
| 3 | Team | **5 engineers + EM.** Pipeline backend, submit backend, AI engineer, frontend, full-stack (supports all streams and **owns the extension**). EM ~30% hands-on. Borrowed: designer ~0.3, DevOps ~0.25, legal ad hoc, career coaches (~40h labelling), product/founder for pilot cohort and pricing. No dedicated QA or PM. | Author rejected a separate extension engineer in favour of the 5th full-stack engineer. Team size stated as an assumption; replace with Careerflow's actual numbers if different. |
| 4 | Ownership | Each engineer **leads a vertical**: go-to owner, accountable for its internal SLA and minimum uptime. Every vertical has a **primary and secondary owner** (standard). Every system is built by **2+ people with one clear lead**. **Bugs and incidents go round robin across the whole team, AI systems included**, so everyone knows everyone's code. | Claude added: weekly off-hours rotation so owners aren't on call 24/7. |
| 5 | AI-assisted development | A documented, versioned **AI development playbook** (shared repo skills, architecture hooks, contract guards, AI first-pass code review with mandatory human approver, AI-generated test scaffolds reviewed by the owner), part of onboarding for new joiners. **AI share-out every 1–2 weeks** where people present what they've found; adopted practices go back into the playbook. Doubles as upskilling and team-building (author has run this before). | Claude: AI compresses research and build, not legal review, eval labelling or the pilot calendar; the plan says so. |
| 6 | Research | **2–3 days, AI-assisted, decision-focused**: get the key data points for final decisions, not exhaustive manual research. | Author cut Claude's 2-week estimate. |
| 7 | Golden set | A **separate parallel process**, starting once research defines what's needed; results needed after ~3 weeks (eval gate). | — |
| 8 | Design | **Max 1 week (hard cap):** HLD finalised by EM + stakeholders in 1–2 days; LLD (data models, contracts, eval spec) in 2–3 days, done in parallel by the engineers who will build it. Ends with everything documented for fast execution. | Author cut Claude's 2-week estimate. |
| 9 | Sprint 1 | **2 weeks**, including testing and time for previous bugs/maintenance. Increment 1 = Greenhouse end to end, approval queue only, guardrails + verifier. | Author cut Claude's 4-week estimate. |
| 10 | Sprint 2 | **2 weeks**: increment 2 + bugs and learnings from sprint 1. | — |
| 11 | Hardening | Rigorous testing, evals and system improvements: **1 week, 2 worst case**. Lighter load; resources start planning the next feature set. Only low-quality systems get a "why" analysis; delays are discussed and fixed at the root. | — |
| 12 | Retros | After every sprint **from sprint 2 onward** (sprint 1 won't yield enough). | — |
| 13 | Pilot | **1 week** with data gathering, constant observation and saving data for evals; offered to current **power users** as a beta; rollback on critical failure. **+1 week fix/improvement buffer**, only if needed. **Extendable.** | Claude: a 1-week pilot can't measure interviews (employers take 1–3 weeks), so go/no-go uses leading indicators. Extension rule: extend by one week only when indicators are ambiguous (not failing), max one extension. |
| 14 | GA | Staged rollout over 2 weeks. | Agreed as proposed. |
| 15 | Legal / DPA | Starts day 1 in parallel; gates the pilot (no real user data to the model before the DPA is signed). Shortlist only providers with a standard DPA + zero retention. | Claude pushback, accepted. |
| 16 | Critical path | research → HLD → adapter contract + data model → Greenhouse end to end (S1) → approval modes + cancel window (S2) → eval gate → pilot → GA. | Agreed. |
| 17 | Cut line | **Lever + Ashby built together as one unit by one owner** (the submit lead; similar work, one system). Cut order if S2 slips: Lever+Ashby unit → digest reduced to in-app funnel → extension handoff. **Never cut:** guardrails and verifier, cancel window, global pause, cost breaker, per-ATS monitoring. | Author changed Claude's proposal (separate Ashby then Lever) to one combined unit. Research week samples Lever/Ashby forms to size variance. |
| 18 | Resources | Order-of-magnitude INR line items, labelled as assumptions verified in research week. | Agreed. |
| 19 | Early cost | Early per-user cost is higher (analyse-once needs density; power users are heavier; fixed floors don't shrink) and users arrive gradually. **Middle path:** pilot LLM budget ~₹2.5L with a 70% alert, per-user ₹80/day breaker kept, cohort ramps, infra scale-to-zero. Report cost/user/day alongside **users per analysed job** (amortisation ratio). | Raised by the author; Claude first proposed budgeting at the ₹80 ceiling (~₹3–3.5L). |
| 20 | Daily standup | **30 min, 5 min per person** (yesterday, today, blockers). | Author's format. |
| 21 | Blockers | Max 30-min sync between the people involved; **resolution posted on the team Slack** so the unblock doesn't cause another block. If the **EM is the blocker, unblocking is highest priority**; the dev works on something else meanwhile. | Claude added: blocker open >1 working day escalates to EM; >2 days goes into the stakeholder update. |
| 22 | Demos and stakeholders | **Weekly demo per dev.** Stakeholder update weekly or per SLA; **critical things highlighted early** so stakeholders help pick the solution (e.g. a feature cut). | — |
| 23 | Decision rights | Vertical lead decides inside a vertical (decision log); cross-vertical (contract, shared data model, queue interfaces) = EM with affected leads, 24h timebox, ADR; cuts within the cut line = EM, same day; cuts beyond it, date changes, go/no-go = EM recommends, founders/product decide; legal/terms/data policy = legal sign-off, never overridden for schedule. Reversible decisions made by the owner without a meeting; disagree and commit after the timebox. | Agreed ("standard"). |
| 24 | EM decision style | The EM doesn't start from hard opinions: understands the problem statement, takes time to gather full context, discusses, and the best and most optimised path is chosen. | Author's own approach. |
| 25 | Rollout and gates | Stages, gates and kill criteria as in section 6 below. | Agreed. |
| 26 | North star | Interviews per active user per week is **directional only**: enough attribution data may never exist. Post-GA kill criterion uses proxies with a minimum sample, never the north star alone. | Author's point, already raised in the design doc. |
| 27 | Tickets | Story-point based (Fibonacci). **No ticket longer than 1 day**; anything bigger is split. Ticket count derived from 5 devs + 30% EM + buffer for previous bugs. | Author's rule. |

---

## PLAN

### 0. Scope and assumptions
- **Endpoint:** GA of v1. Post-GA roadmap (not scheduled): additional ATS adapters (continuous), conversational onboarding interview, agentic browser channel, MCP/API adapters, skill assessment, re-evaluating seen jobs, learning loops, tiering, credential vault (only if business case + explicit user request).
- **v1 includes:**
  - Greenhouse, Lever and Ashby submit via Playwright, plus Chrome extension handoff
  - Approval modes, cancel window, global pause, daily digest with funnel
  - Resume parse + signup preferences form + confirmation screen
  - Shared catalog with analyse-once, queues per stage, cost breaker
  - Guardrails: injection checks on job descriptions, PII minimisation, claim verifier, hold to `needs_you`
  - Monitoring and the eval gate
- **Team assumption:** 5 engineers + EM.

### 1. Team

| Role | Vertical lead for | Notes |
|---|---|---|
| Backend: pipeline (PL) | Ingestion, catalog, queues, cost breaker, retention/deletion | — |
| Backend: submit (SB) | Adapter contract, Greenhouse, Lever + Ashby (one unit), channel router, canaries | — |
| AI engineer (AI) | Analysis, matching, generation, verifier, guardrails, evals | — |
| Frontend (FE) | Onboarding, approval modes, cancel window, run/funnel, holds, digest UI | — |
| Full-stack (FS) | Extension (owner), profile service, auth, flags, audit, encryption | Supports other streams; pairs on AI and golden-set tooling |
| EM | Plan, decisions, stakeholders, unblocking | ~30% hands-on: adapter contract, cross-vertical reviews, round-robin bug rotation |

**Borrowed:** designer ~0.3, DevOps ~0.25, legal ad hoc, career coaches ~40h, product/founder for pilot cohort and pricing. **No dedicated QA** (engineers own tests, AI lead owns evals, coaches do pilot acceptance). **No dedicated PM.**

**Ownership model:** vertical lead + secondary owner; systems built by 2+ people with one lead; lead owns internal SLA and minimum uptime; bugs/incidents round robin across the whole team; weekly off-hours rotation.

**AI-assisted development:** versioned playbook (repo skills, architecture hooks, contract guards, AI first-pass review + mandatory human approver, AI test scaffolds reviewed by owner), part of onboarding; AI share-out every 1–2 weeks. AI compresses research and build, not legal, labelling or pilot calendar time.

### 2. Phases, durations, deliverables

| Phase | When | Deliverable / milestone |
|---|---|---|
| 0. Research | W1, days 1–3 | Research readout + decision memo: ATS form survey (~50 boards, Lever/Ashby sampled), ATS terms summaries for legal, LLM provider shortlist (DPA, zero retention), baseline interview rates, test-board options, cost inputs, extension feasibility |
| 1. Design (max 1 week) | W1 day 4 → W2 day 3 | HLD signed off in 1–2 days; LLD in 2–3 days (adapter contract, data model, queue interfaces, AI schemas, eval spec, guardrails, UX flows, observability plan, AI playbook v1, environments/CI). **M0: execution kickoff (W2)** |
| Golden set (parallel) | W1 day 4 → W4 | ~300 jobs labelled (AI pre-labelling + coach confirmation), agreement check, must-hold form cases. **Golden set v1 frozen (W4)** |
| Legal (parallel) | W1 → W6 | DPA + zero retention signed, ATS terms sign-off, user terms, privacy notice + retention policy. **Gates external dogfood** |
| 2.1 Sprint 1 | W3–W4 | **M1 internal alpha:** Greenhouse end to end, approval queue only, guardrails + verifier, onboarding, run view, pause, audit log; includes bug/maintenance buffer |
| 2.2 Sprint 2 | W5–W6 | **M2 feature complete:** Lever + Ashby, extension handoff, approval modes, cancel window, digest, retention/deletion, monitoring + canaries, eval runners, shadow mode; first retro |
| 3. Test, evals, hardening | W7 (W8 worst case) | **Testing report:** eval gate results, security review, load test at 10× pilot, E2E across 3 ATSs + extension, runbooks, quality analysis; dogfood ~10 users; next-feature planning. **M3: pilot go/no-go** |
| 4. Pilot | W8 (+W9 fix week if needed; max one extension week) | Power users ramped 50 → 200; daily gate review; pilot data into eval sets. **M4: pilot readout + GA go/no-go** |
| 5. GA | W10–W11 | 10 → 25 → 50 → 100%, each step held 48h. **M5: GA** |

**Total:** ~11 weeks base, ~14 worst case (hardening +1, fix week +1, pilot extension +1).

**Code review deliverables:** AI first pass + human approver on every PR; EM cross-vertical reviews of contract and data model each sprint; whole-branch review before M3.

### 3. Dependencies and critical path
- **Critical path:** research → HLD → adapter contract + data model → Greenhouse end to end (S1) → approval modes + cancel window (S2) → eval gate → pilot → GA.
- **Parallel tracks that become critical if late:** legal/DPA (blocks pilot), golden set (blocks W7 eval gate), test ATS board (blocks canaries and per-ATS monitoring).
- **Off the critical path:** extension handoff (if late, unsupported ATSs get an Apply button).
- **Cut order if S2 slips:** (1) Lever + Ashby unit moves post-GA (ship whichever passes its canary if only one does); (2) digest → in-app funnel only; (3) extension handoff.
- **Never cut:** guardrails and verifier, cancel window, global pause, cost breaker, per-ATS monitoring.

### 4. Resources and costs (order of magnitude; verified in research week)

| Item | Choice | Pilot |
|---|---|---|
| LLM API | Provider with standard DPA + zero retention, behind the swappable interface | ~₹2.5L budget, 70% alert, ₹80/user/day breaker |
| Browser workers | Playwright in short-lived, scale-to-zero containers (GCP-native) | ~₹20–40k/month |
| Data | Firestore, Postgres + pgvector (minimal tier), object storage, BigQuery | ~₹25–40k/month |
| Queues | Managed, GCP-native *(open item)* | Small |
| Observability | Error tracking, tracing, dashboards/alerts | ~₹10–20k/month |
| AI dev tools | Team seats for 6 | ~₹50k–1L/month |
| Task management | Notion (board + timeline) | Existing |
| Test ATS board | Own careers board, vendor sandbox or partnership | Decided in research; flagged as a risk |

**Cost curve:** early per-user cost sits near the ceiling (low job overlap between users, heavy power users, fixed floors) and users arrive gradually. Infra defaults to scale-to-zero; the cohort ramps; cost per user per day is reported with the amortisation ratio (users per analysed job), with the claim that cost trends from near ₹80 toward the ₹30 target as density grows.

### 5. Leadership and execution
- **Moving into execution:** kickoff after HLD (W2): leads and secondaries named, definition of done (tests, evals where relevant, vertical dashboards, runbook entry), cut line and never-cut list stated, AI playbook v1 handed over. Design ends fully documented so execution starts without open questions.
- **Rituals:**
  - Daily standup: 30 min, 5 min per person (yesterday, today, blockers)
  - Blocker syncs: only those involved, max 30 min; resolution posted on team Slack
  - EM as blocker: highest priority; dev switches to other work meanwhile
  - Weekly: demo per dev; stakeholder update (or per SLA)
  - Every 1–2 weeks: AI share-out
  - Each sprint: planning; retros from sprint 2 onward
- **Decision-making:** EM gathers full context, discusses, chooses the best path rather than starting from a fixed opinion. Decision-rights table:

| Decision | Owner | How |
|---|---|---|
| Inside a vertical | Vertical lead | Decision log; secondary informed |
| Cross-vertical (contract, shared data model, queue interfaces) | EM with affected leads | 24h timebox, ADR |
| Cuts within the cut line | EM | Same day; stakeholders informed |
| Cuts beyond the cut line, date changes, go/no-go | EM recommends; founders/product decide | Raised early with options |
| Legal, ATS terms, data policy | Legal sign-off | Never overridden for schedule |

Reversible decisions: owner decides without a meeting. Disagreements: argue within the timebox, then disagree and commit.

- **When something slips:** blocker >1 working day → EM; >2 days → stakeholder update; weekly critical-path review; cut-risk raised before the date is missed; cut order applied the same day; no adding people mid-sprint; pilot extension only on ambiguous indicators, max one week; slips and weak systems analysed in hardening week and retros to fix causes.

### 6. Rollout, guardrails, metrics, kill criteria
- **Stages:** (1) Dogfood W7: team + ~10 users, approval queue only. (2) Pilot W8: power users 50 → 200, auto-submit only on APPLY NOW with cancel window, default mode timer auto-approve. (3) GA W10–11: 10 → 25 → 50 → 100%, 48h hold per step.
- **Go/no-go gates:** submit success ≥ 95% per ATS; zero unconfirmed factual fields submitted; cancel + override ≤ 10% of auto-submits; holds resolved within 48h for most users (hold rate tracked); cost within pilot budget curve; no open critical security findings.
- **Kill and rollback:**
  - Global pause immediately: fabricated claim submitted, data leak, platform terms notice or block.
  - Disable that ATS channel, fall back to one-tap: submit success < 80% on any ATS.
  - Revert default to approval-only: post-GA interview rate per application clearly below manual baselines over 4–6 weeks, given a minimum sample; without enough data, use proxies (employer response rate, 14-day check-in outcomes), never the north star alone.
- **Metrics:** north star = interviews per active user per week (**directional only**; attribution may never be complete); business = pilot-to-paid conversion; operational = submit success per ATS, override/cancel rate, time to resolve holds, cost per user per day, amortisation ratio.

### 7. Task management
- **Tool:** Notion database "Auto-apply v1 tasks" with a board view (grouped by phase) and a timeline view (Start → End).
- **Fields:** Task, Ticket, Phase, Owner (lead), Pairs with, Start week, Points, Depends on, Start, End, Status.
- **Sizing rule:** 1 pt = up to 2h, 2 = up to half a day, 3 = up to 1 day; nothing over 1 day.
- **Capacity:** per sprint 5 devs × 10 days = 50 dev-days − 10% ceremonies − 20% bug/maintenance buffer = 35 dev-days + ~2 EM days ≈ 111 pts. Planned commitment ≈ 85–95 pts (S1 = 93, S2 = 83). Buffers are reserved capacity rows, not tickets.
- **Size:** 132 rows: Research 9, Design 13, Golden set 10, Legal 5, Sprint 1 36, Sprint 2 34, Hardening 11, Pilot 7, GA 7.
- **Dates:** illustrative, with Week 1 = Monday 12 Oct 2026. Generated by a scheduler that respects dependencies and each lead's 3 pts/day capacity.

### 8. Board adjustments made while scheduling (review these)
Made by Claude to keep each lead within capacity and sprints inside their boundaries; not discussed in the interview:
- AI lead was over capacity in W2–W4, so: G2 (pre-labelling pipeline) → FS with AI; G8 (must-hold cases) → SB with AI; G9 (agreement check) → EM with coaches; S1-13 (PII minimisation) and S1-16 (eval harness skeleton) → FS with AI.
- S1-33 (tracing) led by DevOps with FS; S2-26/S2-27 (alerts) led by DevOps with PL; S2-28 (cost dashboard) → FS with PL; S2-31 (feature flags) → FE with FS.
- S1-26/S1-27/S1-28 (approval queue, run view, holds UI) depend on the data model and AI schemas, not on finished backend tickets: built against contracts, integrated at the M1 demo.
- GA steps spaced 48h apart (Dec 14, 16, 21, 23); pilot gate review spans the pilot week, readout on its Friday.

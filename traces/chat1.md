# Careerflow.ai EM Take-Home: AI Auto-Apply Design Interview (Transcript)

**Tool:** Claude (claude.ai chat, Claude Opus 5.5), inside a claude.ai Project named "carrerflow assignment"
**Date:** 7 October 2026
**Purpose:** Decide WHAT the prototype does and WHY, before implementation in Claude Code. Shared with Careerflow as part of the Responsible Use of AI statement.

**Context attached to the chat as project files (not reproduced here):**
- `Assignment_-_Careerflow_-_Engineering_Manager_-_2026-09-20.pdf`: the assignment brief
- `SETUP.md`: my Claude Code starter kit and runbook

**Notation:** Tool actions Claude took (memory reads, web searches, browser checks) are summarised in *[italic brackets]*. Inline citation markup from web search results has been removed; the cited sentences are kept as written.

---

## User

I'm doing the Engineering Manager take-home for Careerflow.ai. The brief and my Claude Code starter kit (SETUP.md) are in the project files. I'm submitting tonight. This transcript will be shared with Careerflow as part of my Responsible Use of AI statement.

This chat decides WHAT the prototype does and WHY. The detailed Firestore data model is out of scope; that happens later in a Claude Code design session (/grill-with-docs).

Only the brief's requirements are fixed. SETUP.md is my proposal, not a settled decision: challenge its choices (AI provider, EC2 deployment, hardcoded preferences, SSE, anything else) wherever a different choice would serve the prototype or the reviewers better.

How to run this:
- Interview me one question at a time. For each, give your recommended answer and a one- or two-sentence reason, then wait for my decision.
- Push back if I'm over-building for a prototype, or if an answer is generic and wouldn't hold up in front of a reviewer.
- Don't re-ask what the brief already fixes. Aim for roughly 10–15 questions.

Cover at least:
1. Full auto-apply vs an approval queue (and what the single button actually triggers)
2. The flow from button press to final statuses, and which statuses exist
3. Exactly what the AI does, what it returns, and how it fails (fallback behaviour)
4. What lives in Firestore vs what's hardcoded (preferences, filters, settings)
5. What's simulated (job source, applying) and how honestly the UI labels it
6. AI provider and model
7. Deployed vs local only
8. What we explicitly won't build

End with a block titled DECISIONS: a numbered list, one line of reasoning per decision, then a short "Out of scope" list, and a "Changes to the kit" list noting where a decision departs from SETUP.md. I'll review it here and ask for changes in this chat before I paste it into the kit's ASSIGNMENT.md and CLAUDE.md.

## Claude

*[Read the project's memory note about this take-home.]*

Here's the first question. I'll keep each to one decision.

**Q1. What does the single button trigger: full auto-apply, or an approval queue?**

**Recommendation:** The button runs one complete, unattended run: fetch jobs, filter, AI match, then apply to every job above a match threshold. Jobs below the threshold are marked skipped, with the AI's reason shown. The prototype has no approval step. The design doc then argues that the *launched* product should default to a review-first mode, where the AI drafts each application and the user approves it in one tap, with full auto as an opt-in for users who have built up trust in the matcher.

**Reason:** The brief asks for one button plus real-time statuses, and an approval queue would put a second interaction loop in the middle of the demo. As a product call, though, auto-submitting weak applications under a user's name is the biggest trust and reputation risk this feature has. Saying so, and designing the rollout around it, is the EM-level judgement reviewers will look for. It also gives the risk assessment a concrete mitigation to point to instead of a generic one.

Do you agree, or do you want the prototype itself to show an approval step?

---

## User

i understand the review mechanism will be super important for users , but for now lets skip it , we can do unattended run in the prototype , but i want to question the job source. the brief says "simulate job scraping", and with hardcoded keywords and filters, discovery is clearly in scope, so i don't want link-only. i also don't want pure fixtures if we can do better. and for applying in production, i am thinking a mix the extension for review mode and anything behind a login, headless playwright workers for login-free platforms for applications or a system to link user profiles and somehow to create / login user on other platforms with automation. (can be decided later)

## Claude

Noted for Q1: the prototype does an unattended run, and the design doc presents review mode as the launch default.

On your production apply ideas, two of the three hold up. One I'd challenge now rather than leave for later:

- **The extension**, for review mode and anything behind a login, is the strongest part. It runs in the user's own browser, with the user's own session, while the user is present. That avoids most of the problems with credentials, CAPTCHAs and terms of service.
- **Headless workers** for login-free ATS forms (Greenhouse, Lever, Ashby application pages) are plausible. The doc should still name them as the most fragile, most anti-bot-exposed part of the system and give them a fallback to the extension.
- **Automatically creating accounts and logging in on other platforms** is the one I'd rule out explicitly. It means storing third-party passwords, solving or bypassing CAPTCHAs, and breaking most platforms' terms of service. A reviewer will read it as the riskiest line in the submission. Listing it as "considered and rejected, here's why" is a strength. Leaving it as "TBD" reads as a gap.

**Q2. Where do the prototype's jobs come from?**

**Recommendation:** Do real discovery against **public ATS job-board APIs**. Greenhouse, Lever and Ashby each publish a no-auth JSON endpoint per company that lists open roles with full descriptions. These endpoints exist so that jobs can be republished, which means this is sanctioned, not scraping. You hardcode a list of around 10–20 company board tokens. The pipeline fetches from them live, normalises the results into one job shape, and applies your hardcoded keyword and location filters before the AI step. Fixtures stay, but only as the test fake and as a labelled fallback when a source is down. That fallback also gives you a free demo of the "API reliability" risk mitigation.

**Reason:** This beats both pure fixtures and HTML scraping. The jobs are real and different every run, so discovery is visibly genuine. Unlike scraping LinkedIn or Indeed, there's no terms-of-service or brittleness story to defend. It also lines up with your production apply plan, since these are the same ATSs your headless workers would target. The trade-off is that each API needs about 30 lines of adapter code, and the exact endpoints should be confirmed in the Claude Code session before the tickets lock them in.

Do you agree, or do you want a different source, such as a job aggregator API or actual scraping?

---

## User

give links for these job boards , i dont know if this will work or not , i was thinking of a scraper , using hermes mcp and hermes using web cli 3 to browse the web and finding the jobs according to the user's profile , but that might be over engineering for a prototype . i would like to check these job board apis first and then take a decision on this

## Claude

*[Ran three web searches to confirm the current Greenhouse, Lever and Ashby public job-board endpoints.]*

Here are the three endpoints, with links you can try in a browser or with curl. None of them needs a key.

**Greenhouse**
- Docs: https://developers.greenhouse.io/job-board.html
- Try: `curl "https://boards-api.greenhouse.io/v1/boards/stripe/jobs?content=true"`
- It returns one company's published jobs per call, looked up by board token, with no key and no endpoint that lists all boards. The token is the slug in a company's `boards.greenhouse.io/<token>` careers URL. Authentication (HTTP Basic with a Job Board API key) is only required for POSTing applications, so reading jobs is open, but applying through the API is reserved for the employer.

**Lever**
- Docs: https://github.com/lever/postings-api
- Try: `curl "https://api.lever.co/v0/postings/spotify?mode=json"` (palantir also works)
- Some accounts are hosted in the EU region and respond on `api.eu.lever.co/v0/postings/{site_slug}` instead. One gotcha worth knowing before you rely on it: the public GET can intermittently return HTML instead of JSON even with mode=json set, an issue that has been open since 2020.

**Ashby**
- Docs: https://developers.ashbyhq.com/docs/public-job-posting-api
- Try: `curl "https://api.ashbyhq.com/posting-api/job-board/openai?includeCompensation=true"` (ramp and linear also work)
- Each job includes an isRemote flag, the description as both HTML and plain text, and a publishedAt timestamp. The plain-text description is convenient for feeding straight into the AI step.

All three are the same feeds companies use to render their own careers pages, which is why they're defensible in front of a reviewer. For broader coverage later, Recruitee and Workable also have public, unauthenticated job APIs.

On the Hermes idea: I can't vouch for the specific Hermes MCP or "web CLI 3" tooling, so I won't pretend to evaluate it. As a pattern, though, an agent browsing the web to find jobs is the wrong choice for this demo. It's slow (minutes per run), non-deterministic, costs tokens for every page, and can fail live while a reviewer is watching your video. It does have a natural home in the design doc, as a production "long-tail discovery" tier for companies that aren't on any ATS API, running behind the same normalised job shape. That earns you credit for the idea without risking the demo on it.

**Q2 stays open until you've tested these.** My recommendation is unchanged: use the three ATS APIs with a hardcoded list of about 15 company slugs, keep fixtures as the test fake and a labelled fallback, and put agent-based discovery in the doc as future work. Run the three curls and tell me what you find.

---

## User

i made the api call to greenhouse, the first link i got was for

```json
{
  "absolute_url": "https://stripe.com/jobs/search?gh_jid=8172510",
  "data_compliance": [
    {
      "type": "gdpr",
      "requires_consent": false,
      "requires_processing_consent": false,
      "requires_retention_consent": false,
      "retention_period": null,
      "demographic_data_consent_applies": false
    }
  ],
  "education": "education_required",
  "internal_job_id": 3537063,
  "location": {
    "name": "Seattle, San Francisco, New York City"
  },
  "metadata": null,
  "id": 8172510,
  "updated_at": "2026-09-25T16:45:00-04:00",
  "requisition_id": "See Opening ID",
  "title": "Abuse Investigator",
  "company_name": "Stripe",
  "first_published": "2026-09-09T10:50:29-04:00",
  "language": "en",
  "application_deadline": null,
  "content": "...",
  "departments": [
    {
      "id": 81946,
      "name": "8611 Security Analytics",
      "child_ids": [],
      "parent_id": 78876
    }
  ],
  "offices": [
    {
      "id": 65234,
      "name": "US",
      "location": null,
      "child_ids": [],
      "parent_id": 673
    }
  ],
  "ai_disclaimer": null,
  "include_ai_disclaimer": false,
  "ai_opt_out_request_url": "http://app.greenhouse.io/ai_opt_out_request/job_post/8172510/ai_opt_out"
}
```

in this the url goes to stripe website , and i made another api call , the object looks like this

```json
{
  "absolute_url": "https://job-boards.greenhouse.io/anthropic/jobs/4461450008",
  "internal_job_id": 4147866008,
  "location": {
    "name": "New York City, NY; San Francisco, CA | New York City, NY"
  },
  "metadata": [
    {
      "id": 4036944008,
      "name": "Location Type",
      "value": "On-Site",
      "value_type": "single_select"
    }
  ],
  "id": 4461450008,
  "updated_at": "2026-08-21T21:32:54-04:00",
  "requisition_id": "3356",
  "title": "Account Executive, AI Native",
  "company_name": "Anthropic",
  "first_published": "2024-12-20T13:53:38-05:00",
  "language": "en",
  "application_deadline": null
}
```

and it makes call to antropic greenhouse page .

now even though job discovery is sorted from this link , how do we apply to different page designs ? since they are non standard

## Claude

Discovery is settled, then. Q2 decision: live Greenhouse/Lever/Ashby APIs, with fixtures as the fake and fallback. One detail from your output: the Anthropic object has no `content`, which suggests that call was made without `?content=true`. Make sure the adapter always sends it, or the AI will have no description to work with.

**Applying to non-standard pages**

The prototype doesn't need to solve this, because the actual submit is simulated. It's still the right question for the design doc, and your two objects actually show the answer.

1. **Don't apply on the company's page; apply on the ATS form.** Stripe's `absolute_url` points to stripe.com, but `gh_jid=8172510` shows it's a Greenhouse job embedded in Stripe's site. Behind every Greenhouse job, whatever page wraps it, there is usually a standard hosted form at `job-boards.greenhouse.io/<token>/jobs/<id>` (worth spot-checking on Stripe). So the problem isn't "N company page designs." It's one form layout per ATS: three for Greenhouse, Lever and Ashby. That's why discovering jobs through ATS APIs pays off when you apply.

2. **Read the form as data, not by looking at the page.** For Greenhouse, the single-job endpoint takes `?questions=true` and returns the application questions, with `?pay_transparency=true` adding pay ranges. That gives you each field's label, type, whether it's required, and its options, so the AI fills a schema instead of guessing at the DOM. Playwright or the extension then just types the values into fields it already knows about. Lever's `/apply` page is also standardised. I'd check Ashby's form before claiming anything about it.

3. **The truly custom pages (Workday, in-house portals) go to the extension in review mode.** The headless workers don't touch them. That keeps them out of the automated path, which fits your production plan.

Your Stripe output also shows a `data_compliance` block with GDPR consent flags. Where a job requires consent, the system must not tick the box on the user's behalf; it has to show the consent to the user. That's a concrete compliance point for the risk section.

**Q3. What exactly does the AI do?**

**Recommendation:** Two calls per job, each returning validated JSON:
- **Match:** `{score 0–100, decision: apply|skip, reasons[], missing_requirements[]}`, comparing the hardcoded profile and preferences against the job description. Jobs below the threshold are marked skipped, and the reasons are shown in the UI.
- **Fill** (matched jobs only): fetch the live Greenhouse question schema, then return `{field_id: answer}` for each question, plus a short tailored cover note. Any required field the AI can't answer confidently, and any consent field, is flagged `needs_user` instead of being invented.

The simulated submitter then "submits" that real payload and stores it, so the UI shows exactly what would have been sent.

**Reason:** Matching on its own is a solved demo. Filling a real form schema is the hard part of auto-apply, and showing it working on live data is what separates your submission from the others. The `needs_user` flag also connects the prototype to the review mode you're putting in the doc. One consequence: this pushes the prototype towards Greenhouse first, with Lever and Ashby as discovery-only adapters. I'd accept that trade-off.

Agree, or would you keep the AI to matching only?

---

## User

*[Attached: the full scheduled-agent prompt I use for my own job search with Hermes. It contains the scoring rubric, company blocks, hard blocks, language gate, fit points 1–10, verdict rules (APPLY NOW / APPLY / STRETCH), resume-variant rule, Notion logging, and run limits.]*

<details>
<summary>Attached prompt (verbatim)</summary>

```
If today is Sunday, stop immediately and output only "Sunday: skipped".

TASK: overnight catch-up for India. On Monday, cover everything since Saturday 6:30 PM (LinkedIn f_TPR=r140400); on other days, since 6:30 PM yesterday (f_TPR=r52200). Split the 15-description limit: about 10 for LinkedIn, 5 for Naukri.

LINKEDIN INDIA: three searches in this order, each with location=India, f_TPR=r52200 (r140400 on Monday), sortBy=DD (most recent). Go through all result pages within the window until the 15-description limit.
1. keywords ("engineering manager" OR "engineering lead" OR "head of engineering" OR "tech lead" OR "technical lead" OR "team lead")
2. keywords ("staff engineer" OR "lead engineer" OR "lead software engineer" OR "principal engineer" OR "founding engineer" OR "full stack lead" OR "backend lead") AND (node OR nodejs OR react OR typescript OR javascript OR MERN)
3. keywords ("senior software engineer" OR "SDE 3" OR "SDE III" OR "senior full stack" OR "senior backend engineer") AND (node OR nodejs OR react OR typescript OR javascript OR MERN)

NAUKRI: while logged in, search in this order: "Engineering Manager", "Tech Lead", "Staff Engineer", "Senior Software Engineer Node.js". Filters: freshness "Last 1 day", experience 7 years, sort by date. Naukri has many IT-services and agency listings; the company blocks matter most here.

INDIA SALARY FLOOR: 45 LPA. Region = India. Locations accepted: Delhi NCR, Bengaluru, Hyderabad, Mumbai, Pune, Chennai, or remote open to India. Mandatory onsite elsewhere without relocation support is a hard block.

CANDIDATE: Shubham Muthreja, Gurugram India. About 7 years experience (career start Aug 2019). Engineering Manager at Digital Paani 2023-2025 with a team of 6 (real-time IoT platform scaled from 4 to 55+ plants, AWS Lambda, SQS, MongoDB). Co-Founder & CTO of Qurkle 2025-present (Node.js/TypeScript product API; LLM matching engine in Python/FastAPI built largely with AI assistance). Available immediately. GOAL: management and tech-lead roles first, senior/lead IC second.
STRONG: JavaScript, TypeScript, Node.js, Express, React, Next.js, MERN, MongoDB, AWS, real-time/event-driven systems, system design, team leadership.
WORKING KNOWLEDGE: Python, FastAPI, LangChain, RAG, LLM APIs, SQL/PostgreSQL, Redis, Docker.
NOT: Java, Spring, Go, Rust, .NET, Angular, Kubernetes, ML training, data science.

CARD-FIRST TRIAGE: judge from the listing card (title, company, location, applicants, Easy Apply label). Open the full job description only if the card looks plausible. Skip without opening: link already in the Index; title outside target (sales, QA, data scientist, ML engineer, DevOps/SRE-only, SAP/Salesforce, Java/.NET/PHP developer, intern, fresher); company blocked below.

COMPANY BLOCKS: IT services/outsourcing/consulting firms at any size (Accenture, TCS, Infosys, Wipro, HCLTech, Tech Mahindra, Cognizant, Capgemini, LTIMindtree, Deloitte, EY, PwC, KPMG, IBM). Banks and financial institutions incl. their tech/capability centres (JPMorgan, Barclays, Goldman Sachs, Morgan Stanley, Citi, Wells Fargo, HSBC, Deutsche Bank, American Express, Bank of America, UBS); fintech product companies are fine. Companies with 10,000+ employees, except strong product companies (e.g. Flipkart, Myntra, Swiggy, Zomato, PhonePe, Paytm, Ola, Meesho, Zepto, Nykaa, MakeMyTrip, Zoho, Freshworks, Razorpay, CRED, Groww; abroad: product-led tech firms like Spotify, Booking.com, Shopify, Atlassian, Mercari). Judge size from what you already know or the card; do not open company pages. Staffing agencies are allowed; if they name a blocked client, block.

HARD BLOCKS (Index only): salary shown and its maximum is below the floor; experience minimum 8+ years ("7-10" is fine); 10+ direct reports or manager-of-managers; contract-only, part-time or freelance; ML training, research, data science, MLOps, data engineering, QA, DevOps-only roles; AI strategy consulting. No salary shown is never a reason to block.

LANGUAGE GATE (IC titles only, never manager titles): JS/TS/Node/React primary is normal. Python-primary IC caps at APPLY. Java/Go/Rust/.NET/Angular-first or mobile-only IC goes to STRETCH. AI-titled IC roles cap at APPLY unless the stack is JS/TS.

FIT 1-10 (cap 10): title, highest only: +3 manager (Engineering Manager, Engineering Lead, Head of Engineering at startups, Tech Lead, Technical Lead, Team Lead); +2 lead IC (Staff, Lead, Principal, Founding Engineer); +1 senior IC (Senior Software Engineer, SDE 3, Senior Full Stack/Backend). Stack: +3 JS/TS/Node/React primary, else +1 partial overlap. +1 real-time/IoT/high-volume data. +1 hands-on leadership. +1 startup/scale-up. +1 experience band within 5-9 years. +1 LLM features in product (bonus only). -1 pure people management. -2 IC in a stack he does not use.

VERDICT: APPLY NOW = fit 7+ with no gaps. APPLY = fit 5-6, or 7+ with minor gaps. STRETCH and hard blocks go to the Index only, never the Tracker. Over 100 applicants with fit below 7: Index only.

RESUME: manager titles -> "EM plain"; IC -> "Staff plain". Use "EM styled"/"Staff styled" only for direct-email applications.

NOTION (databases already exist; never create, check or modify schemas):
- "Seen Job Links (Index)": query it before opening any job description; normalise links by removing query parameters. For every description you open, add a row: Link, Date Seen.
- "Job Application Tracker": for each APPLY NOW / APPLY, add a row with exactly these properties: Company (title) as "Company · Role", Link, Resume, Verdict, Status = "Not applied", Date Found = today, Semantic Fit, Region.

LIMITS: open at most 15 full job descriptions this run. If a site shows a CAPTCHA, security check, login wall or rate-limit notice, stop immediately; never try to solve or bypass it. Never click Apply, Easy Apply, Submit or any form control. No cover lines, keywords or tailoring.

OUTPUT, keep it short: "Surfaced N (APPLY NOW n, APPLY n)", then one line per surfaced role: Verdict · Company · Role · Fit. Then "Read X/15 descriptions" and any stop reason.
```

</details>

give me edited links for greenhouse job boards for both the sample objects i gave you , i need to do a spot check .
a) instead of scoring out of 100 , lets first decide on a rubric , in my own agentic setup i am using the following prompt for scoring and job discovery , i think its apt for demo as well , this entire thing is the prompt i am using in various hermes schedules but the rubric is mentioned in this .
b) for fill , ofcourse we will need to create the object acc to the requested fields , but this will work upon the saved user profile (entire user experience till date , extracted from resume in prod , hardcoded for the demo) along with job title as a key field to be added to the rubric , what do you think ?

## Claude

**Spot-check links**

Stripe (job 8172510):
- Hosted form: https://job-boards.greenhouse.io/stripe/jobs/8172510
- Embed form (what stripe.com wraps): https://boards.greenhouse.io/embed/job_app?for=stripe&token=8172510
- Question schema: https://boards-api.greenhouse.io/v1/boards/stripe/jobs/8172510?questions=true

Anthropic (job 4461450008):
- Hosted form: https://job-boards.greenhouse.io/anthropic/jobs/4461450008
- Question schema: https://boards-api.greenhouse.io/v1/boards/anthropic/jobs/4461450008?questions=true

What to check: if both hosted forms render the same Greenhouse layout, and both `?questions=true` calls return a `questions` array with field names, types and required flags, then the "one form layout per ATS" claim holds. If Stripe's hosted URL redirects back to stripe.com, the embed URL is the fallback. Tell me what you see.

**a) Your rubric**

It's a much better basis than a bare 0–100 score. It's explainable and additive, and it separates hard blocks from fit. I'd adopt its structure with three changes for the product setting.

1. **Split deterministic checks from AI judgement.** The hard blocks are rules, not opinions: salary floor, location, contract type, company blocklist, and "already seen". Code should apply them before any AI call. That's cheaper, testable, and a reviewer can see that no tokens are spent on blocked jobs. The AI only judges what code can't: title tier, primary stack, experience minimum and team size as stated in the description, and the domain signals (real-time, startup, LLM features).

2. **The AI returns evidence, code does the arithmetic.** Instead of asking for a fit score, ask for each criterion with a boolean and a one-line quote from the description, for example `{title_tier: "manager", stack_primary_js: true, evidence: "..."}`. Code then sums the points and assigns the verdict. You get the same rubric, but the score is reproducible, unit-testable, and every point can be traced to a sentence in the description. It also makes the fallback honest: when the AI is unavailable, a keyword matcher fills in the same criteria object, and the UI labels the result "fallback scoring".

3. **Make it a parameterised preferences object, not a prompt.** Your blocklists, floor, locations and language gate become the hardcoded user preferences the brief asks for. In production they'd be the same object, per user. Drop the parts that don't apply to this source: applicant count, Easy Apply, LinkedIn and Naukri searches, and Notion.

That leaves one decision for an unattended run: **APPLY NOW auto-submits, APPLY is held** with a "below auto-apply threshold" status. That's the safe default the design doc argues for, at almost no extra cost.

**b) Fill: full profile, with the job title as a key field**

Agreed, with one clarification. The title is already the highest-weighted criterion in the rubric (+3, +2 or +1), so it doesn't need adding there. Where it should do new work is in **selecting the profile framing**. A manager-tier title fills answers and the cover note from the EM framing; an IC title uses the Staff framing. That's your "EM plain vs Staff plain" rule, turned into product logic.

I'd also separate two inputs that get blurred together:
- **Profile:** experience, skills and achievements. In production this comes from the resume; for the demo it's hardcoded from yours.
- **Application settings:** salary expectation, notice period, work authorisation, relocation, consent defaults. These are the brief's "application settings", stored as explicit values. The AI copies them; it never infers them.

The fill rule: every answer must trace to the profile or the settings. Anything else is marked `needs_user`. That's the guard against an AI inventing a notice period or a visa status under the user's name.

**Q3, revised:** code applies the hard blocks, then the AI extracts rubric evidence, then code scores and assigns a verdict; APPLY NOW is auto-filled from profile plus settings (with title-tier framing) and submitted in simulation, and APPLY is held. Do you agree, and do you want the demo to use your real profile or a fictional persona? I'd use yours: it's authentic, and you can speak to every match in the video.

---

## User

both the forms are about 40-50% same but differ as well , so a one structure fits all will not probably work here for autofill , can you yourself do a fetch and check , browser is connected .
agreed on the rubric then , use my profile , we will extract the json we finalize from my resume in the end to be saved

## Claude

*[Tried to fetch the question API directly (blocked: the URL hadn't come from a search result) and through Claude in Chrome (extension not reachable after two attempts).]*

I couldn't run the check myself. The Chrome extension isn't reachable from this session (two attempts failed), and my sandbox's network can't reach greenhouse.io. If you want me to retry, open the Claude side panel in Chrome, make sure you're signed in, and tell me. The quicker route is to paste the output of the two `?questions=true` calls here and I'll compare them field by field.

Your 40–50% finding is what I'd expect from how Greenhouse documents its forms, and it doesn't break the approach. It sharpens it. "One structure fits all" was never going to work. What works is **one form renderer per ATS, fed by a per-job question schema**. The overlap and the differences fall into three tiers, each with a different owner:

1. **Standard fields** (name, email, phone, resume, cover letter, LinkedIn, location): this is your shared ~50%. They're filled deterministically from the profile, with no AI involved.
2. **Employer custom questions** ("Why Stripe?", years with X, notice period, sponsorship): these are where the forms differ. The AI answers them from the profile and application settings, or returns `needs_user`.
3. **Compliance and demographic questions** (EEOC, GDPR consent, AI opt-out): never auto-answered. They stay blank or "decline to self-identify" per the user's explicit setting, and consent goes to the user.

This is my reading of the documented format, not something verified on your two jobs. Your paste will confirm which tier each Stripe and Anthropic field falls into, and that comparison is worth a screenshot in the design doc.

Q3 decision recorded: code applies hard blocks, the AI extracts rubric evidence, code scores, APPLY NOW is auto-filled and submitted in simulation, APPLY is held. Your profile is hardcoded for now and swapped later for the JSON extracted from your resume.

**Q4. What lives in Firestore, and what's hardcoded?**

**Recommendation:** Keep a hardcoded seed file in the repo containing your profile, rubric preferences and application settings. A seed step writes it to **one user document in Firestore**, and the pipeline reads it from Firestore on every run, never from the file. The UI shows these preferences read-only, with no edit form. Firestore also holds runs, one record per job evaluated (verdict, rubric evidence, filled payload, status, timestamps), and a seen-jobs set, so a second run skips jobs already processed. The list of 15 company board tokens stays in code config.

**Reason:** That satisfies both halves of the brief, "hardcode preferences" and "Firebase stores user preferences", without building a settings UI. The seen-jobs set makes run two visibly different from run one, which shows idempotency in the video. Storing the filled payload per job is what lets a reviewer click a job and see exactly what would have been sent.

Agree? You can paste the question JSON with your answer.

---

## User

if we are anyways going to store in firebase , then whats the point of hardcoding , we can also give edit profile in the settings , barely too much work, but it will be good ux , also system will only work for one user so doesnt really matter.
add the links the system has seen in a firestore as visited and a rubric and timestamp when it was seen etc. this is so that the system doesnt unnecessarily scan the same thing again and again , this will be the basis of our dedupe logic since we are using links and job ids , it will be a good unique tracking id.
also i want you to test both the links with chrome once as well , and then we can finalize the auto-apply thing

## Claude

*[Using Claude in Chrome: read both `?questions=true` schemas, opened the Stripe hosted URL (redirected to stripe.com, no form), the Stripe embed URL (Greenhouse form, 64 inputs), and the Anthropic hosted URL (Greenhouse form, 33 inputs), then closed the tab. Nothing was filled in or submitted.]*

I checked both jobs in Chrome, through the question API and the live forms. The findings change the auto-apply design, so here they are first.

**What the check showed**

| | Stripe: Abuse Investigator | Anthropic: Account Executive |
|---|---|---|
| Hosted URL | Redirects to stripe.com, which has no form | Works, renders the Greenhouse form |
| Embed URL (`/embed/job_app?for=…&token=…`) | Works, renders the form | Not needed |
| Questions in API | 16 | 19 |
| Standard fields | Name, email, phone, resume, cover letter | Name, email, phone, resume, LinkedIn |
| Fields outside `questions` | School*, Degree*, City* (from the `education` and `location_questions` keys) | None seen |
| Employer-specific | Current employer and title, country of residence, countries to work in, work authorisation, sponsorship, remote intent, ex-Stripe, US city | Relocation, 4 days in office, start date, timeline, sales experience (free text), "Why Anthropic?" (free text), interviewed before, visa sponsorship |
| Consent and legal (required) | WhatsApp marketing opt-in | **"AI Policy for Application"** acknowledgement, **Agreement to Arbitrate** |
| Demographic | EEOC section | Gender, Hispanic/Latino, Veteran |

Three things follow from this.

1. **The adapter has to merge four sources**: `questions`, `location_questions`, `education`, and `compliance`/`demographic_questions`. If it reads only `questions`, it misses Stripe's required School and Degree fields. It also needs a URL fallback: hosted URL first, embed URL if the hosted one redirects off Greenhouse.

2. **Anthropic asks whether you accept its policy on AI in applications, and it's a required field.** An auto-apply product answering that on the user's behalf is exactly the kind of thing a reviewer will probe. The rule must be: the system never answers it. Arbitration is a legally binding agreement, so the same rule applies.

3. **Both sample jobs have required consent or legal fields.** So with an honest rule, neither could be submitted fully unattended. That's real evidence for your design doc: fully unattended auto-apply rarely completes on real forms, which is why review mode should be the launch default. You found it on live data rather than asserting it.

**On Q4 (your changes)**

Agreed on an editable settings page; for a single user it's good UX at modest cost. I'd still keep the seed file, but only as first-boot defaults written when the user document doesn't exist yet. Without it, a fresh checkout has an empty profile and the first run does nothing. One scope note: preferences and application settings are flat, so plain forms work. The profile has a nested experience list, so give it simple add/remove/edit sections, with the shared schema validating on the server.

Agreed on the seen-jobs collection, with one correction your Stripe sample proves. **Key on `ats:board:jobId` (e.g. `greenhouse:stripe:8172510`), not the link.** The same Stripe job has three URLs: stripe.com with `gh_jid`, the hosted Greenhouse URL, and the embed URL. The job ID is the only stable identity, so keep the URLs as stored fields. Each record holds: first and last seen timestamps, the job's `updated_at`, the verdict, the rubric evidence and score, and a **preferences version**.

That last field matters now that the profile is editable. Re-evaluate a seen job only if its `updated_at` has changed or your preferences version has. Otherwise editing your profile silently does nothing to jobs already seen. Every other seen job is skipped with no AI call.

**Q5. Finalising auto-apply: how is each field filled, and when does a job actually submit?**

**Recommendation:** Every field in the merged schema gets one of four sources.
- **Profile** (deterministic): name, contact details, resume, LinkedIn, employer, title, education.
- **Settings** (deterministic, mapped to the field's options): country, work authorisation, sponsorship, relocation, start date or notice period, remote intent, companies you've previously worked for or interviewed with, and marketing opt-ins, defaulting to No. These are standing choices you made once, so applying them is legitimate.
- **AI**: free-text answers ("Why Anthropic?", experience questions) and the cover note. Answers must trace to the profile, and the title tier selects the EM or Staff framing.
- **User only**: legal agreements, employer AI-policy acknowledgements, and demographic questions. The system never answers these. Demographic fields are left blank when optional.

**Submit rule:** an APPLY NOW job is submitted (in simulation) only if every *required* field resolves from the first three sources. Otherwise it's **held: needs you (n fields)**, and the UI lists exactly which fields and why.

**Reason:** This is the honest version of "auto": it automates everything the user has already decided and stops at anything that is legally or ethically theirs. The live check suggests many real jobs will be held, and the demo should show that rather than hide it.

Agree? If you'd rather let settings pre-accept some consent types, tell me which ones; I'd only allow marketing opt-ins.

---

## User

"That last field matters now that the profile is editable. Re-evaluate a seen job only if its `updated_at` has changed or your preferences version has. Otherwise editing your profile silently does nothing to jobs already seen. Every other seen job is skipped with no AI call."
we can add it to the future spec or the complete product document , this is over engineering for a demo

first tell me the simulation that we are talking about , how will it actually work ? will it be on a real link or will it simulate an api call , or a form fill ?

## Claude

Agreed. Re-evaluation goes into the full product document. For the demo, a seen job is always skipped, and profile edits only affect jobs the system hasn't seen yet.

**How the simulated submit could work**

There are four realistic options, and they differ a lot in cost and risk.

**A. Simulated API call (no browser).** The submitter builds the exact payload Greenhouse's application endpoint expects, using the real field IDs from the job's schema (`first_name`, `question_68935507`, the resume, and so on). It waits a short, realistic delay, then returns an outcome without sending anything anywhere. The full payload is stored on the job record, so the UI can show "this is exactly what would have been sent." Outcomes are submitted, failed (a small simulated failure rate with realistic reasons such as "form schema changed" or "upstream timeout", seeded so tests are deterministic), or held (needs you).

**B. Real API submit.** This isn't possible. Greenhouse's application POST requires the *employer's* API key, which is why third-party auto-apply tools drive browsers instead.

**C. Real form fill on the live page, stopping before Submit.** Playwright opens the real Stripe or Anthropic form, fills every field, takes a screenshot, and never clicks Submit. It looks the most impressive, but it's the worst choice tonight. It puts Chromium on your server, it's brittle (selectors, the resume upload, the embed fallback), it's exposed to anti-bot measures, it can fail live during your video, and it touches employers' real systems without consent, which is awkward to defend in a Responsible Use section.

**D. Mock ATS form.** The backend serves a local page rendered from the job's *real* question schema. Playwright fills it and submits to your own mock endpoint. This shows the whole mechanism (real schema, real browser fill, real submit) without touching any employer. It's honest and impressive, but it's another half-day of work.

**Recommendation: A for the prototype, with C/D described in the design doc as the production worker.**

Option A still demonstrates the hard parts on live data: discovery, the merged schema, rubric matching, field resolution across the four sources, and held jobs. The only thing it fakes is the final network call, and a payload keyed to real Greenhouse field IDs makes the gap to production one concrete step: hand it to a worker. Labelling should be blunt. The status reads "Submitted (simulated)", a page-level banner says nothing is sent to employers, and each job has a "View payload" link.

Do you go with A, or do you want D despite the time it costs?

---

## User

lets go with option A at the moment , if time permits later , i will add and test with playwright / hermes , but it will be all experimental and done later.

## Claude

Option A it is: a simulated submit with the real-field payload stored and shown, and Playwright or Hermes recorded as later experimental work.

Since you didn't object, I'm treating the Q5 field resolution as accepted: profile, settings, AI, and user-only sources, with a job held whenever a required field can't be resolved. Tell me if you want to revisit it.

**Q6. The run flow, and which statuses exist**

**Recommendation:** Two levels of status, both written to Firestore and pushed live to the UI.

**Run statuses:** `discovering` → `evaluating` → `applying` → `completed` | `failed`

1. Button press creates a run. Only one active run is allowed; a second press returns 409, and the button is disabled while a run is active.
2. **Discovering:** fetch every board in parallel, merge the results, drop jobs already seen, apply the hard blocks in code, and show the counts ("212 found · 180 seen · 21 blocked · 11 to evaluate"). If a board fails, that board falls back to fixtures with a visible tag. The run continues.
3. **Evaluating:** the AI extracts rubric evidence and code scores it, with up to 3 jobs in flight at once, so statuses visibly arrive one by one.
4. **Applying:** fetch the question schema, resolve fields, then simulate the submit.

**Job statuses:** `queued` → `evaluating` → one of the following:
- `blocked` (which hard rule)
- `skipped` (fit below APPLY)
- `held` (reason: `below_auto_threshold` for APPLY, or `needs_you` with the list of fields)
- `applying` → `submitted (simulated)` | `failed` (reason)

**Cap:** at most 15 AI evaluations per run, a number borrowed from your own Hermes limit. Anything left over waits for the next run. That bounds cost and run time (around a minute), and gives run two something new to do, which suits the video.

**Reason:** Run-level counts show the funnel, which is the product story. Job-level statuses with reasons give the brief's "success / failure / pending" in real time, plus the explanations a reviewer will want. Every terminal status carries a reason, so nothing in the UI is an unexplained red or green.

Agree, or do you want to change the cap, the concurrency, or any status?

---

## User

all this looks good , just along with the button there should be visible the previously applied jobs , i dont think we will be getting failure , so lets simulate it , lets make it so that the submit of one of the shortlisted jobs fails and there is a retry button , (in real world the retry would probably require human overwatch , be added to the eval set for the llm as an edge case and all the reason for failure and retry limit logic , but we wont do it here we can add all this to the future spec ) on retry we can show the payload and succeed it . we can also show a list of all scanned jobs , for user's refrence , 3 api calls in parallel works as well

## Claude

Done. All of that fits the data we're already storing, so it adds screens, not new systems. Recorded:

- **Home screen:** the auto-apply button and the live current run, with **Applied jobs** underneath (every `submitted` job across runs, newest first, each with its payload link).
- **Scanned jobs view:** every seen job with its verdict, score, reason, the run that found it, and a link to the posting.
- **Demo failure:** in each run, the first job to reach submit fails with a visible reason. A **Retry** button shows the payload, and the retry succeeds. To stay honest, the reason itself says "Simulated failure (demo)" so nobody mistakes it for a real upstream error. The README and design doc state the rule. Human oversight, eval-set capture and retry limits go into the future spec.
- **Concurrency:** 3 jobs in flight.

**Q7. How do live updates reach the browser?**

**Recommendation:** Keep SETUP.md's choice, **SSE from the Express API**, with one addition: on every connection, the server first sends a full snapshot of the run (run status plus all job statuses), then sends changes as they happen. The API listens to Firestore internally with `onSnapshot`. The browser never talks to Firebase.

The alternatives, and why I'd pass on them:
- **Browser reads Firestore directly** (client SDK `onSnapshot`). This removes the SSE code, but it puts Firebase config and security rules in the browser, needs auth to protect the rules, and splits the "how the frontend talks to the backend" story the brief explicitly wants shown. Your architecture guard also forbids it.
- **Polling every second.** This is the simplest and most robust option, but "live" then really means "refreshed," and it doesn't scale as a story.

**Reason:** The brief asks to show frontend and backend interacting seamlessly, and one API boundary does exactly that: one place for validation, rate limits and auth later. Snapshot-then-deltas makes reconnects lossless for free, because `EventSource` reconnects on its own and the fresh snapshot repairs whatever was missed. That covers page refreshes mid-run and proxy hiccups after deployment. Your kit has already tested the nginx path for this.

Keep SSE?

---

## User

sse was the agreed upon design earlier as well , run status is important in case the user refreshes , good to point out , lets do it this way

## Claude

SSE with snapshot-then-deltas is recorded.

**Q8. AI provider and model**

**Recommendation:** Switch from DeepSeek to **Claude Haiku 4.5** (`claude-haiku-4-5-20251001`) for both calls, evidence extraction and fill. Use structured output via tool use, validate every response against the shared schema, and put the provider behind a one-file interface so swapping it is an env change.

Two rules come with it:
- **Minimise what the AI sees.** Name, email, phone and address never go to the model. Standard fields are filled deterministically, so the AI only gets your experience, skills, the job description and the free-text questions. That's a concrete data-minimisation point for the compliance section.
- **Failure behaviour per job:** one retry on timeout or invalid JSON, then the deterministic keyword matcher for that job only, labelled "fallback scoring". Fill answers that fail stay `needs_you`. With no API key at all, the whole run uses the fallback, which is what keeps tests and fresh checkouts working.

**Reason:** The data-security risk section is where DeepSeek hurts you. You'd be sending a user's career history to a provider whose data handling a GDPR-minded reviewer will question, and "it was cheaper" is a weak answer from an EM candidate. Haiku is fast and cheap enough for 15 evaluations per run, handles schema-bound extraction well, and is one of the providers the brief names. If the free-text answers feel thin in testing, raising only the fill call to Sonnet is a one-line change.

Do you switch to Haiku, or do you have a reason to keep DeepSeek, such as credits you already have or something you want to show about provider-agnostic design?

---

## User

no deepseek works , the idea is to show the work , i already have a key and it has money in wallet as well .

## Claude

DeepSeek stays, and that's a reasonable call: you already have the key and credit, and the swappable interface is itself part of showing the work. The data-minimisation rule still applies: no name or contact details reach the model.

One thing to keep from my previous point, because it's the question a reviewer will ask: the data-security section should say plainly that DeepSeek is a prototype choice, and that production would use a provider with a data processing agreement and a no-training, limited-retention commitment, behind the same interface. Choose the exact model string from your DeepSeek dashboard, with JSON output mode on.

**Q9. Deployed or local only?**

**Recommendation:** Deploy to EC2 as the kit plans, with two conditions.

1. **Put HTTP basic auth on the whole site at nginx**, and give the reviewers the credentials in your submission email. This matters more now than when SETUP.md was written. With an editable profile and no app-level auth, a public URL would let anyone read your phone number and email, rewrite your profile, and trigger runs that spend your DeepSeek credit. Basic auth is a few lines of nginx and needs no app code. Also enable the kit's `POST /api/runs` rate limit; it's commented out and ready.

2. **Timebox it.** If the deployment isn't smoke-tested by a fixed hour tonight, submit with local setup instructions plus the video, and send the URL as a follow-up. A broken live link in the submission costs more than no link.

**Reason:** A working URL is the strongest single signal in a take-home, because a reviewer can press the button themselves, and your kit has already done the hard parts (nginx with SSE, certbot, pm2, the deploy script). The basic-auth gate turns "your personal data on a public endpoint" from an obvious risk into a mitigation you can name in the risk section.

Agree, and what cut-off time do you want for the deploy?

---

## User

we will do it on ec2, with nginx and certbot that all has been decided already , sure , a small login form with basic creds pre configured and no new account creation can be in the scope , a basic login page doesnt hurt the scope , but we will have to do proper JWT in the backend , with password stored using bcrypt hash , also add the CORS config etc. for the same , we will do dev on nodemon and the deployment can be on pm2 for the demo , for scale we can use the best practices we can decide later for the scale when we make that doc

## Claude

EC2 with nginx, certbot and pm2, nodemon for development, and a login page are all agreed. Scale practices go into the scale document. There are three refinements to the auth design, and the first one is a real bug, not a preference.

1. **Put the JWT in an httpOnly cookie, not an `Authorization` header.** The browser's `EventSource`, which SSE uses, can't send custom headers. With header-based JWT, your live stream would fail authentication. The usual workaround is putting the token in the query string, which leaks it into nginx logs. So the server sets the token as an `httpOnly; Secure; SameSite=Strict` cookie on login, and every request, the stream included, carries it automatically. Use a 12-hour expiry with no refresh tokens; logout clears the cookie.

2. **CORS: allow nothing, because you won't need it.** nginx serves the app and `/api` from the same origin, and in development Vite's proxy keeps it that way. So the right configuration is no cross-origin access at all, rather than an allow-list. `SameSite=Strict` also covers CSRF on `POST /api/runs`, so no CSRF tokens are needed.

3. **One user and one bcrypt hash.** A small script generates the hash, which lives in an environment variable on the server; the plain password exists only in your submission email. Use bcrypt cost 12, with an nginx rate limit on `/api/auth/login` (the kit's limiter pattern, applied to one more location). There's no signup route, so "no account creation" holds by construction.

**Q10. What we explicitly won't build**

**Recommendation:** This becomes the "Out of scope" list, each with a one-line pointer to where it's covered.
- Real submission to employers: no browser workers, extension, or employer API (production design in the doc; Playwright or Hermes experiments come later)
- Review mode and approval queue (doc: launch default)
- Lever and Ashby beyond discovery, plus other ATSs and agentic web discovery (doc: adapters and long-tail tier)
- Re-evaluating seen jobs when a posting or the preferences change (future spec)
- Retry limits, failure triage, and failure capture for the eval set (future spec)
- Resume parsing into the profile (manual JSON extraction for now)
- Multi-user support, signup, password reset, and roles
- Scheduled or background runs; runs start only from the button
- Notifications (email or push)
- Horizontal scaling, queues, and multiple pm2 instances (scale doc)
- An evaluation harness for matching quality (doc: test set plus feedback loop)

**Reason:** Each item is something a reviewer could reasonably expect. Naming it, with a pointer to where it's designed, shows the cuts were deliberate, not accidental.

Do you want to add or remove anything? Once you confirm, I'll write the DECISIONS block.

---

## User

the frontend deployment , even though on the same server , i will do a static serve , after doing a build , this is the best practice , instead of serving from the nodejs , this is to showcase how backend and frontend work seamlessly in prod. so we will need cors and other setups . JWT , can be stored in local storage for ease , but cookie works as well , its a small thing and we are just making it for a demo ,
all this makes sense , we will not be making any langchain calls for the demo , since it doesnt make sense in such a small scope , but for the doc plan proper guardrails, PII removal , batching logic , maybe a keyword extraction from the jd to check the vector lenght with the user profile for the match , we can remove the llm call for matching all this can be explored , is not in current scope

## Claude

Agreed: no LangChain in the prototype. Guardrails, PII redaction, batching, and an embedding-similarity prefilter that ranks jobs cheaply before (or instead of) the LLM call all go into the design doc. The prefilter in particular is a strong scale story: it makes per-job cost close to zero for jobs that are obviously wrong.

Two clarifications on your deployment point, so the DECISIONS block is accurate.

- **Static serve from nginx is already the plan.** The kit's nginx config serves the built frontend with SPA routing and caching, and Node only serves `/api`. So that part doesn't change. What decides whether you need CORS is the *origin*, not the server. If the app and the API share one domain (`yourdomain.com` and `yourdomain.com/api`), the browser never makes a cross-origin request. I've written it so both setups work: CORS middleware with a single exact origin from env, credentials allowed, and nothing else permitted. That's correct whether you keep one domain or split to `api.yourdomain.com`, and it shows a deliberate CORS setup rather than `*`.
- **Use the cookie for the JWT.** localStorage can't authenticate the SSE stream without putting the token in the URL, so the cookie is the option that just works.

---

### DECISIONS

1. **The button triggers one unattended run.** The brief asks for one button and live statuses; review mode is argued in the design doc as the launch default.
2. **Live job discovery from the public Greenhouse, Lever and Ashby APIs**, about 15 hardcoded boards, always with `content=true`. These are sanctioned, no-auth feeds of real jobs; scraping LinkedIn or Naukri carries terms-of-service and brittleness risk.
3. **Fixtures serve as the test fake and as a labelled per-board fallback** when a source fails. Tests stay deterministic, and the demo shows the API-reliability mitigation working.
4. **Greenhouse first for applying; Lever and Ashby are discovery only.** Only Greenhouse was verified to expose the application form as data (`?questions=true`).
5. **The form schema merges `questions`, `location_questions`, `education`, and `compliance`/`demographic_questions`, using the hosted URL with the embed URL as fallback.** The live check found Stripe's required School and Degree fields outside `questions`, and its hosted URL redirects off Greenhouse.
6. **The rubric comes from my own job-search prompt, turned into a preferences object.** It's explainable and additive, and the hardcoded preferences match a real user.
7. **Code applies hard blocks first, the AI returns per-criterion evidence, and code sums the score and sets the verdict.** Scores are reproducible and unit-testable, every point traces to a quote, and no tokens are spent on blocked jobs.
8. **APPLY NOW is filled and submitted; APPLY is held (`below_auto_threshold`); STRETCH and below are skipped; hard-block failures are blocked.** Only the highest-confidence matches go out unattended.
9. **Each field is filled from one of four sources: profile, settings, AI (free text only), or user only.** The system automates what the user has already decided and nothing else.
10. **Legal agreements, employer AI-policy acknowledgements, consent and demographic questions are never auto-answered.** The live check found Anthropic requiring an AI-policy acknowledgement and an arbitration agreement.
11. **If any required field is unresolved, the job is held as `needs_you`, listing the fields.** That is the honest version of "auto", and evidence for review mode.
12. **The job title tier selects EM or Staff framing for AI answers, and every answer must trace to the profile or settings.** This prevents invented notice periods, visa statuses or experience.
13. **The profile is my own, seeded into a Firestore user document on first boot and editable on a settings page.** It's real data, editable is better UX than hardcoded, and the seed keeps a fresh checkout working. The final JSON will be extracted from my resume.
14. **Firestore holds the user document, runs, per-job evaluations (verdict, evidence, score, payload, status) and seen jobs keyed `ats:board:jobId`.** The live check showed one job behind three URLs; the job ID is the only stable identity.
15. **Seen jobs are always skipped.** That dedupes runs, avoids repeat AI cost, and makes run two visibly different.
16. **Run statuses are `discovering` → `evaluating` → `applying` → `completed`/`failed`, with funnel counts. Job statuses are `queued` → `evaluating` → `blocked`/`skipped`/`held`/`applying` → `submitted (simulated)`/`failed`, each with a reason.** This covers the brief's success, failure and pending, with an explanation for every outcome.
17. **One active run (409), 3 jobs in flight, and at most 15 AI evaluations per run.** That bounds cost and duration, and statuses visibly stream in.
18. **The simulated submit builds the real Greenhouse payload with real field IDs, waits, stores it, and is labelled "Submitted (simulated)" with a banner and "View payload".** Everything except the final network call is real, and nothing is presented as a real application.
19. **The first submit in each run fails with "Simulated failure (demo)"; Retry shows the payload and succeeds.** It demonstrates the failure UX without pretending an error was real.
20. **The UI has the button, the live run, an Applied jobs list, a Scanned jobs view and a Settings page.** These are the history and reference views a user needs, all from data that is already stored.
21. **Live updates use SSE from Express: a full snapshot on connect, then deltas, with the API listening via Firestore `onSnapshot`. The browser never touches Firebase.** One API boundary, and refreshes and reconnects lose nothing.
22. **The AI is DeepSeek through an OpenAI-compatible, env-swappable interface, with JSON output validated against the shared schema; production would use a provider with a DPA and no-training terms.** The key and credit already exist, and the swappable interface is itself part of showing the work.
23. **No name, contact details or address go to the model.** Data minimisation; standard fields are filled deterministically.
24. **On an AI timeout or invalid JSON, retry once, then use a keyword matcher for that job, labelled "fallback scoring"; with no key, the whole run uses the fallback.** Runs never die on the AI step, and tests need no key.
25. **No LangChain or agent frameworks.** Two schema-bound calls don't justify one.
26. **One user with a login page: bcrypt hash (cost 12) in env, JWT in an `httpOnly; Secure; SameSite=Strict` cookie with 12-hour expiry, no signup, and a rate limit on login.** It protects my personal data and DeepSeek credit on a public URL, and the cookie is what lets SSE authenticate.
27. **CORS allows one exact origin from env, with credentials.** It's correct whether the API shares the app's domain or a subdomain, and it's deliberate rather than `*`.
28. **Deploy to EC2: nginx serves the static build and proxies `/api` to Express under pm2 (one instance); certbot handles HTTPS; nodemon in development; the `POST /api/runs` rate limit is enabled from day one.** A reviewer can press the button themselves, and the kit has already tested the SSE proxy path.

#### Out of scope
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

#### Changes to the kit
- **Ticket 03 (job source):** fixtures-only → live ATS adapters with fixtures as the fake and a per-board fallback.
- **Ticket 04 (AI matcher):** match-only → rubric evidence extraction plus code scoring, and a fill call; the fallback matcher returns the same rubric shape.
- **Ticket 05 (submitter):** generic simulated apply → a payload from the merged real question schema, field resolution and the `needs_you` hold, a deterministic first-submit failure and a retry endpoint.
- **Ticket 06 (history and limits):** "past runs" → Applied jobs and Scanned jobs views; caps set to 15 evaluations and 3 in flight.
- **New tickets:** settings page with Firestore-backed profile, preferences and application settings plus first-boot seed; login with JWT cookie, bcrypt and CORS.
- **Contract (`contract.ts`):** the new run and job statuses, rubric evidence, verdicts, held reasons and payload types; the guard will ask before each edit.
- **Dependency ADR:** add `jsonwebtoken`, `bcrypt` (or `bcryptjs`), `cookie-parser`, `cors`, `nodemon`.
- **nginx:** add a rate-limited `/api/auth/login` location, and enable the `POST /api/runs` limit now rather than in section 7.
- **CLAUDE.md:** the AI provider stays DeepSeek, but add the no-PII-to-model rule and the production-provider note; the architecture guard is unchanged (the browser still never touches Firebase or AI).
- **ASSIGNMENT.md:** paste in the brief's document requirements, as SETUP.md step 3 says.

Review it here, and tell me what to change before you paste it into the kit.

---

## User

export this chat as a transcript called master.md

## Claude

*[Created this file.]*

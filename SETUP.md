# AI Auto-Apply assignment: setup and runbook

This kit turns an empty repo into a workspace tuned for the assignment: Matt Pocock's skills for alignment, specs, tickets, TDD and review; custom skills for unattended ticket runs, demo checks and documents; report-only verifier agents; hooks that enforce the architecture; human gates for risky actions; and a tested nginx + certbot + pm2 deployment for EC2.

**The plan in one paragraph:** you design and build the foundation locally (about 2.5 hours), then hand the remaining tickets to a Claude cloud session that works through them in a loop. While it runs, you write the documents and set up Firebase and EC2. Then you pull the work back, check it in the browser, review it, and deploy to your domain.

## Architecture

```
Browser (React)  ──POST /api/runs──────────────▶  nginx (HTTPS, your domain)  ──▶  Express API (pm2, 1 instance)
       ▲                                                                              │  pipeline in-process:
       └──SSE /api/runs/:id/events◀── live updates ◀── Firestore onSnapshot ◀─────────┤  fixtures → filter → AI → simulated apply
                                                                                      ├──▶ Firestore (Admin SDK; rules deny browsers)
                                                                                      └──▶ DeepSeek (OpenAI-compatible, swappable via env)
```

There is no emulator and no Java. One real Firebase project serves development, tests, cloud sessions and production; a `FIRESTORE_NAMESPACE` prefix (`dev`, `test-*`, `prod`) keeps their data apart. Most tests use an in-memory repository; a small integration suite hits the real project in a throwaway `test-*` namespace.

## What's in the kit

```
ASSIGNMENT.md              the full brief, verbatim
docs/DECISIONS.md          product decisions (D1–D28) from the scoping chat; wins over CLAUDE.md
CLAUDE.md                  project brief: stack, flow, deployment facts, human gates, enforced rules
CODING_STANDARDS.md        standards + "landmines" the code-review skill checks
firestore.rules            deny-all for browsers (the API uses the Admin SDK)
.mcp.json                  Playwright (headless browser) + Context7 (current library docs)
.claude/settings.json      permissions (allow / ask / deny) + hooks
.claude/hooks/
  session-start.sh           cloud sessions only: npm install
  guard-contract.sh          asks before anyone edits packages/shared/src/contract.ts
  guard-architecture.mjs     AI calls only in apps/api/src/ai/; no Firebase, keys or AI in the web app; no agent frameworks
  format.sh                  Prettier + ESLint --fix on every edited file
  stop-typecheck.sh          Claude can't finish a turn with type errors
.claude/agents/
  e2e-tester.md            drives the app in a browser, reports observed vs expected
  security-reviewer.md     read-only security pass for this stack and the EC2 setup
  doc-reviewer.md          checks documents against assignment, spec, ADRs and code
.claude/skills/            14 vendored Matt Pocock skills + run-tickets, demo-check, write-deliverable
deploy/
  EC2.md                   step-by-step server, Firebase, nginx, certbot and smoke tests (human steps)
  nginx/auto-apply.conf    site config: SSE without buffering, SPA routing, caching, headers, rate limit ready
  ecosystem.config.cjs     pm2 config (single instance on purpose)
  deploy.sh                build locally → rsync → npm ci → pm2 reload → smoke test
docs/agents/               pre-filled config for the Matt Pocock skills (local issue tracker in .scratch/)
docs/adr/  docs/deliverables/  .scratch/
```

The nginx config was tested against a stub SSE server: events arrive one by one through the proxy, page routes fall back to `index.html` with security headers intact, and with the rate limit enabled `POST /api/runs` gets `429` after the burst while GETs are never limited.

---

## Skills and agents

Type user-invoked skills as slash commands. Automatic ones are picked up when relevant; you can also name them.

### From mattpocock/skills

| Skill | Type | Use it for |
|---|---|---|
| `/grill-with-docs` | you | Once at the start. Claude interviews you in rounds, each question with a recommended answer, until the design is settled; writes `GLOSSARY.md` and ADRs as decisions land. |
| `/grill-me` | you | The same interview without docs: before a document that depends on your judgement. |
| `/to-spec` | you | Turns the interview into `.scratch/auto-apply/spec.md`: user stories, decisions, test seams, out of scope. |
| `/to-tickets` | you | Breaks the spec into thin end-to-end tickets with blocking edges, one file each. |
| `/implement` | you | Builds one ticket test-first, reviews it, commits. For the tickets you do yourself. |
| `implement-spec` | via `/run-tickets` | Works through the ticket graph with a fresh subagent per ticket, in worktrees, merging as it goes. |
| `tdd`, `codebase-design`, `code-review`, `diagnosing-bugs`, `research` | auto | Test-first loop, module design vocabulary, two-axis review (standards + spec), disciplined debugging, cited research notes. |
| `/handoff` | you | Hands a long session over to a fresh one. |
| `grilling`, `domain-modeling` | auto | Engines behind the grill skills. |

### Custom for this assignment

| Skill / agent | What it does |
|---|---|
| `/run-tickets` | The unattended cloud loop: checks preconditions, runs `implement-spec` with this project's rules (dependency allowlist, contract changes become blockers, 2 fix attempts then move on), runs a final code review, writes `.scratch/auto-apply/RUN_REPORT.md`. |
| `demo-check` | Checks the stream with `curl -N`, then has `e2e-tester` click through the app in a headless browser; cross-checks Firestore locally. Works against localhost or your deployed URL. |
| `/write-deliverable <n>` | Drafts document *n*: checklist from `ASSIGNMENT.md` → sources → outline for your OK → write → `doc-reviewer` → fix. |
| `e2e-tester` agent | Report-only browser tester in its own context. |
| `security-reviewer` agent | Secrets, validation, abuse and cost limits, Firestore rules, prompt injection, proxy setup, nginx. Its out-of-scope list feeds the documents. |
| `doc-reviewer` agent | Checks a document's claims against the code. |

### Carried over from your Resume Tailor setup

Human gates for dependencies, deletes, pushes and deploys; the LLM-layer and runtime-deps guards (merged into `guard-architecture.mjs`); the contract guard (asks instead of blocking); the reviewer's landmines list (now in `CODING_STANDARDS.md`); report-only `e2e-tester` and `security-reviewer`; Context7 and headless Playwright; Prettier + ESLint on edit. Hooks use `node` instead of `jq` and `$CLAUDE_PROJECT_DIR` instead of absolute paths.

Not carried over: the planner, builder, tester and reviewer agents and the slash commands (Matt's skills run the same loop), `PROGRESS.md` (ticket `Status:` lines do that job), `contract-guardian`/`contract-sync` (the shared types package makes drift a compile error), the UI-template, performance and MongoDB pieces.

### Left out of Matt's repo

`wayfinder`, `triage`, `to-questionnaire` (multi-person or multi-week planning), `improve-codebase-architecture` (for existing codebases), `prototype` (throwaway design probes), `pr`, `setup-pre-commit`, `git-guardrails-claude-code` (hooks and permissions cover them), `teach`, `wait-what`, `wizard`, `writing-for-agents`, `ask-matt`, and everything under `in-progress` and `misc`.

---

## Human gates and permissions

| Runs freely | Asks you first | Never (you do it) |
|---|---|---|
| `npm run *`, tests, typecheck, lint, `npm install` / `npm ci`, git add/commit/branch/merge/worktree, curl to localhost | adding/removing/upgrading a dependency not in the dependency ADR, `rm`, `git push`, `ssh`, `scp`, `rsync`, `sudo`, contract edits | `deploy.sh`, `firebase deploy`, `certbot`, `pm2`, force-push, `reset --hard`, reading `.env` files or service-account keys |

---

## One-time setup (about 20 minutes)

1. **Tools:** Node 22 or newer, Claude Code, the GitHub CLI (`gh`). No Java, no `firebase-tools`.
2. **Repo:** create an empty private GitHub repo, clone it, unzip this kit into it, copy the brief to `docs/brief.pdf`, commit and push. (`ASSIGNMENT.md`, `docs/DECISIONS.md` and `docs/deliverables/README.md` are already filled in.)
3. **Firebase (one project, about 10 minutes):** console.firebase.google.com → Add project → Analytics off → Build → Firestore Database → Create database → **production mode**, location **asia-south1**. Then Project settings → Service accounts → Generate new private key; save it **outside the repo**, e.g. `~/.secrets/auto-apply-sa.json`. After the scaffold ticket creates `apps/api/.env.example`, copy it to `apps/api/.env` and set `GOOGLE_APPLICATION_CREDENTIALS` to that path and `FIRESTORE_NAMESPACE=dev`. Optional: switch the project to the Blaze plan with a small budget alert, so a busy test day can never hit the free tier's daily write cap and take the live demo down with it.
4. **Cloud access:** `gh auth login`, `gh auth refresh -s workflow`, then inside `claude`: `/login` and `/web-setup`. At claude.ai/code, give the Claude GitHub app access to this repo. In the cloud environment's settings: add `FIREBASE_SERVICE_ACCOUNT_JSON` (the key file's JSON, pasted as one value) and `FIRESTORE_NAMESPACE=dev`, and allow network access to at least `firestore.googleapis.com` and `oauth2.googleapis.com` (or full access, for today). Rotate the key after submission.
   **Smoke test the cloud before relying on it:** start a session and ask it to run `node -v` and `curl -sI https://firestore.googleapis.com | head -1` and to confirm `FIREBASE_SERVICE_ACCOUNT_JSON` is set (without printing it).
5. **Start Claude Code** in the repo. Check `/hooks` (5 hooks), `/mcp` (Playwright, Context7), `/agents` (3 agents); type `/` to see the skills. Use `/model opus` for grilling and spec work.

No AI key is needed for tests: they use fakes, and without `AI_API_KEY` the app scores with the keyword fallback matcher. Put `AI_*` in `apps/api/.env` when you want real AI scoring locally.

---

## Runbook

### Phase A — local, with you (0:00–2:30)

1. **Design interview:**
   > /grill-with-docs We're building the prototype in ASSIGNMENT.md. docs/DECISIONS.md holds the product decisions; they're settled, so don't relitigate them. CLAUDE.md has the stack. Grill me on the implementation: the Firestore data model, document IDs and namespacing; the repository port and its in-memory twin (including subscriptions); the run and job state machines; the SSE snapshot-plus-delta protocol; the ATS adapter interface and normalisation; the rubric, hard blocks and scoring code; Greenhouse form-schema merging and field resolution; the fallback behaviour; limits; auth and the cookie on SSE; and the test seams. Finish with an ADR listing every dependency we'll allow.

   Expect ADRs (including the dependency list) and `GLOSSARY.md`.
2. `/to-spec`, and confirm the test seams (pipeline with fakes, HTTP API including the stream, the run view).
3. `/to-tickets`, and approve a breakdown roughly like:
   - 01 Scaffold: workspaces, Vite app, Express app, shared contract, the repository port with Firestore and in-memory implementations, namespacing, env parsing, `dev`, `verify`, `build` scripts
   - 02 Tracer bullet: button → `POST /api/runs` → run in Firestore → statuses streamed live over SSE (one fixture job)
   - 03 Job sources: Greenhouse, Lever and Ashby adapters, normalisation, per-board fixture fallback, seen-job dedupe
   - 04 User document: profile, preferences and settings seeded into Firestore on first boot; hard blocks
   - 05 AI evaluator: rubric evidence, code scoring and verdicts, keyword fallback matcher
   - 06 Greenhouse form schema merge, field resolution, `needs_you` holds
   - 07 Simulated submit: payload, the deliberate first failure, Retry; interrupted-run cleanup on startup
   - 08 Limits and history: one active run (409), 3 in flight, 15 evaluations; Applied jobs and Scanned jobs views
   - 09 Login: JWT cookie, bcryptjs, CORS (cuttable; nginx basic auth is the fallback)
   - 10 Production readiness: `trust proxy`, SSE headers and heartbeat, health endpoint, Playwright happy path, README
   - 11 Settings page: read-only, then editable (stretch)

   Order matters: 01–08 are the product; 09–11 can be dropped at the cutoff without breaking anything.
4. Tickets 01 and 02 yourself, each in a fresh context:
   > /implement .scratch/auto-apply/issues/01-*.md — the seams were agreed in the spec; review against the commit before you started.
5. **Checkpoint:** run `demo-check`. Clicking the button must show statuses updating live. Fix this before moving on ("diagnose this").
6. Commit and push.

### Phase B — the cloud loop, and your parallel work (2:30–6:00)

At claude.ai/code, start one cloud session on your branch in **Auto** mode:
> /run-tickets 03-11

It runs unattended. Questions only come up when a ticket hits a human gate, and you can answer them from your phone or the web.

**While it runs:**
- **Documents:** open one cloud session per document with `/write-deliverable <n>`. They draw on the ADRs and spec, which already exist.
- **EC2 server, DNS, nginx**: follow `deploy/EC2.md` sections 1–4 (Firebase already exists).
- **Review as tickets land:** read each ticket's diff in the session's diff view and leave inline comments.

### Phase C — back to local: verify, review, deploy (6:00–8:00)

1. Read `.scratch/auto-apply/RUN_REPORT.md`, decide any blockers, then pull the work down: `claude --teleport` (or fetch the branch).
2. `npm install`, `npm run verify`, then use `demo-check` locally (the cloud loop skipped browser checks).
3. Whole-branch review, in parallel:
   > Use the code-review skill against the first commit; the spec is .scratch/auto-apply/spec.md.

   > Run the security-reviewer agent.

   Fix spec findings first, then Critical/High security findings, then the standards findings that matter.
4. **Deploy** (you): `deploy/EC2.md` sections 5–6, then:
   > Use the demo-check skill against https://your-domain and save screenshots.
5. **Documents:** run the `doc-reviewer` agent on every file in `docs/deliverables/`, fix blocking issues, add the screenshots.
6. README with the live URL, setup in five commands, the architecture diagram, what's simulated, and what you'd do next.

Rate limiting in nginx comes later: uncomment the four `RATE-LIMIT` lines (`deploy/EC2.md` section 7).

---

## When things go wrong

- **A session is long or confused:** `/handoff <what's next>`, then start fresh and point at the handoff file.
- **A bug survives one fix:** "diagnose this" (uses `diagnosing-bugs`).
- **Live updates arrive in one burst after deploying:** buffering. Check `proxy_buffering off` on the events location and the `X-Accel-Buffering: no` header.
- **Runs stuck at "pending" after a deploy:** the interrupted-run cleanup should mark them failed on startup; check `pm2 logs auto-apply-api`.
- **The cloud loop stopped early:** `RUN_REPORT.md` and the `## Blocked` sections in tickets say why; decide, then run `/run-tickets` again for the remaining tickets.
- **The architecture guard fires on something legitimate:** edit the rule in `.claude/hooks/guard-architecture.mjs` and note why in an ADR.
- **Firestore integration tests fail or skip in the cloud loop:** check the environment has `FIREBASE_SERVICE_ACCOUNT_JSON` and network access to `firestore.googleapis.com`. If it can't, the in-memory tests still cover the logic; run the integration suite locally in Phase C. As a last resort, run `/run-tickets` from a local session (same skill, same rules).
- **`RESOURCE_EXHAUSTED` / quota errors from Firestore:** the free tier's daily cap was hit (it resets at midnight Pacific time). Switch the project to Blaze, or wait; check that tests clean up their `test-*` namespaces.
- **Smoke test the guards once after scaffolding:** ask Claude to add a DeepSeek `fetch` call in a route file. It should be blocked and told where AI calls belong.

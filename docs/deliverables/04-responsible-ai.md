# Responsible Use of AI

I used AI heavily on this assignment, and deliberately: the way I would want my team to use it, with me owning the decisions and AI doing most of the typing.

## What AI did

- **Code:** Claude Code wrote almost all of it. I built tickets 01–05b in local sessions, reviewing each one and steering the design. Tickets 04 and 06–17 ran in an unattended Claude Code cloud loop, then I reviewed the work, tested it in the browser and deployed it.
- **Documents:** the technical design document and the project plan were drafted by Claude in the repo from outlines I produced in interview-style chats, then checked against the code by a review agent.
- **Setup and coordination:** before starting, I built a Claude Code harness with Claude's help: skills for design interviews, specs, tickets and TDD; hooks enforcing the architecture; human gates for dependencies, contract changes and deploys; and review agents. It adapts my own earlier project setup and Matt Pocock's open-source skills, and is the first commit in the repo. A private planning chat helped me sequence the work, check each chat's output, write the server setup scripts, and draft this statement.

## What I decided

Every chat is set up so Claude recommends and I decide. Examples where I went against or beyond its suggestions:

- Real job discovery from public Greenhouse APIs instead of fixtures, with only the final submit simulated.
- The rules the agent may never automate: legal agreements, AI-policy attestations, demographic and salary questions.
- In the plan, cutting its estimates (research from two weeks to three days, sprint 1 from four weeks to two), the team shape, and the early-cost budget approach.
- During the build: no silent fallback to in-memory storage, one contract test suite run against both storage implementations, login moved to the cuttable tail, and seed data built only from my own documents, never invented.

## Where the guardrails mattered

- The final audit caught a subagent that had edited the shared contract through the shell, bypassing the approval hook; the diff was reviewed line by line.
- I found a production bug myself (the frontend calling localhost behind HTTPS) and routed the fix into the remaining tickets rather than patching the server.
- Live testing showed my real preferences block almost every posting, so I added a clearly labelled demo preset instead of quietly loosening my rubric.

## Traces

All shared transcripts are listed in `traces/README.md`: the workflow setup chat, the scoping, design and planning chats, and every local Claude Code session including subagents. Two chats are not included: the one where I built the starter kit, and the private planning chat, because both also contain personal material unrelated to the assignment. The cloud loop's work is documented in `.scratch/auto-apply/RUN_REPORT.md`, the ticket logs and the git history.

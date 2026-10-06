---
name: write-deliverable
description: Draft or revise one of the assignment's written deliverables in docs/deliverables/, grounded in the assignment, spec, ADRs, glossary and code, then have it reviewed.
argument-hint: "Which document? (number or name from ASSIGNMENT.md)"
disable-model-invocation: true
---

Write one deliverable document. Work on exactly the document the user named.

1. Read the document's requirements in `ASSIGNMENT.md` and quote them back as a checklist. If the requirements are missing, stop and ask the user to paste them.
2. Gather sources: `.scratch/auto-apply/spec.md`, `docs/adr/`, `GLOSSARY.md`, the code, and any research notes in `docs/research/`. If a fact is missing and can be looked up, call the Skill tool with `research`. If the gap is a decision only the user can make (audience, scope, trade-off stance, numbers), call the Skill tool with `grilling` and keep the rounds short.
3. Propose an outline (headings plus one line each) and wait for the user's OK.
4. Write the document to `docs/deliverables/NN-<slug>.md`:
   - Open with a 3–5 sentence summary a busy reviewer can stop after.
   - Use the glossary's terms. Put flows and architecture in Mermaid diagrams.
   - Label simulated parts and future work clearly.
   - Reference code paths or ADRs for technical claims where it helps the reader.
5. Spawn the `doc-reviewer` subagent on the file. Fix every blocking issue, then update the status table in `docs/deliverables/README.md`.
6. Commit with `docs: <document name>`.

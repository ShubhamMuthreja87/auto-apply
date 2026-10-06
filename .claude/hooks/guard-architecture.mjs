#!/usr/bin/env node
// PostToolUse guard: enforces this project's architecture rules after every edit.
// Exit 2 sends the message back to Claude, which must fix the file before moving on.
import { readFileSync } from "node:fs";
import { relative } from "node:path";

// Set to true only if an ADR decides the browser reads Firestore directly (web SDK + anonymous auth).
const WEB_MAY_USE_FIREBASE = false;

let input = "";
for await (const chunk of process.stdin) input += chunk;
let file;
try { file = JSON.parse(input).tool_input?.file_path; } catch { process.exit(0); }
if (!file || !/\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$|package\.json$/.test(file)) process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const rel = relative(root, file).replaceAll("\\", "/");
if (rel.startsWith(".claude/")) process.exit(0); // don't police the tooling itself
let text;
try { text = readFileSync(file, "utf8"); } catch { process.exit(0); }

const isPkg = rel.endsWith("package.json");
const problems = [];

const AI_CALL = /\/chat\/completions|api\.deepseek\.com|api\.openai\.com|api\.anthropic\.com|@anthropic-ai\/sdk|from\s+["']openai["']/;
const AI_KEY = /(AI|DEEPSEEK|OPENAI|ANTHROPIC)_API_KEY/;

// 1. Exactly one AI layer: provider calls only in apps/api/src/ai/ (env parsing may name the key).
if (!isPkg && !rel.startsWith("apps/api/src/ai/") && AI_CALL.test(text)) {
  problems.push("AI provider call outside apps/api/src/ai/. Put it behind the JobMatcher port in apps/api/src/ai/ and inject it.");
}

// 2. The browser gets no privileged code, no secrets, and (by default) no Firebase.
if (rel.startsWith("apps/web/")) {
  if (/firebase-admin/.test(text)) problems.push("apps/web must never use firebase-admin.");
  if (AI_KEY.test(text) || AI_CALL.test(text)) problems.push("apps/web must never call an AI provider or reference an AI key; the API does that.");
  if (!WEB_MAY_USE_FIREBASE && /["']firebase(\/[a-z-]+)?["']/.test(text)) {
    problems.push("apps/web must not use Firebase: live status comes from the API over SSE (see CLAUDE.md). If an ADR changed this, flip WEB_MAY_USE_FIREBASE in this hook.");
  }
}

// 3. "Basic AI model or API": no agent/RAG frameworks anywhere.
if (/langchain|llamaindex|llama-index|@pinecone|chromadb|weaviate/i.test(text)) {
  problems.push("Agent/RAG frameworks are out of scope. Call the AI provider directly from apps/api/src/ai/.");
}

if (problems.length) {
  console.error(`Architecture guard failed for ${rel}:\n- ${problems.join("\n- ")}`);
  process.exit(2);
}

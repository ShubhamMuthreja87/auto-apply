#!/usr/bin/env bash
# Before Claude finishes a turn, run the typecheck. If it fails, Claude is told to keep going and fix it.
# Runs once per stop (stop_hook_active prevents loops) and only once the project is scaffolded.
input=$(cat)
active=$(printf '%s' "$input" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(String(JSON.parse(s).stop_hook_active===true))}catch{process.stdout.write("false")}})')
[ "$active" = "true" ] && exit 0
cd "$CLAUDE_PROJECT_DIR" || exit 0
[ -d node_modules ] && grep -q '"typecheck"' package.json 2>/dev/null || exit 0
if command -v timeout >/dev/null 2>&1; then out=$(timeout 200 npm run -s typecheck 2>&1) && exit 0; else out=$(npm run -s typecheck 2>&1) && exit 0; fi
printf '%s' "$out" | tail -40 | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{console.log(JSON.stringify({decision:"block",reason:"Typecheck failed. Fix these errors before finishing:\n"+s}))})'
exit 0

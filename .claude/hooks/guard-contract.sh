#!/usr/bin/env bash
# The shared contract (packages/shared/src/contract.ts) is the agreement between web and api.
# Creating it is allowed; changing it afterwards needs a human yes.
input=$(cat)
file=$(printf '%s' "$input" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).tool_input?.file_path??"")}catch{}})')
case "$file" in
  *packages/shared/src/contract.ts)
    if [ -f "$file" ]; then
      echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"packages/shared/src/contract.ts is the web/api contract. Confirm this change, and make sure both apps and their tests are updated in the same commit."}}'
    fi
    ;;
esac
exit 0

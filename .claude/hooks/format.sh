#!/usr/bin/env bash
# Format and lint-fix the file Claude just edited with the repo's own tools, if installed. Never blocks.
input=$(cat)
file=$(printf '%s' "$input" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).tool_input?.file_path??"")}catch{}})')
[ -z "$file" ] && exit 0
cd "$CLAUDE_PROJECT_DIR" || exit 0
case "$file" in
  *.ts|*.tsx|*.js|*.jsx)
    [ -x node_modules/.bin/prettier ] && node_modules/.bin/prettier --write --log-level silent "$file" >/dev/null 2>&1
    [ -x node_modules/.bin/eslint ] && node_modules/.bin/eslint --fix "$file" >/dev/null 2>&1 ;;
  *.json|*.css|*.md|*.html)
    [ -x node_modules/.bin/prettier ] && node_modules/.bin/prettier --write --log-level silent "$file" >/dev/null 2>&1 ;;
esac
exit 0

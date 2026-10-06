#!/usr/bin/env bash
# Cloud sessions only (each is a fresh clone): install dependencies.
# Locally this exits at once and never touches your machine.
[ "$CLAUDE_CODE_REMOTE" = "true" ] || exit 0
cd "$CLAUDE_PROJECT_DIR" || exit 0
[ -f package.json ] || { echo "No package.json yet (pre-scaffold)."; exit 0; }
LOG=/tmp/claude-session-install.log
if { [ -f package-lock.json ] && npm ci || npm install; } >"$LOG" 2>&1; then
  echo "Dependencies installed (log: $LOG)."
else
  echo "Dependency install had errors; read $LOG before running tests."
fi
exit 0

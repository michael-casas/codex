#!/bin/bash
set -euo pipefail

CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
SESSION_ID="${CODEX_SESSION_ID:-${CODEX_THREAD_ID:-}}"
if [ -z "$SESSION_ID" ]; then
  SESSION_ID="$(uuidgen 2>/dev/null || python3 -c 'import uuid; print(uuid.uuid4())')"
fi

exec python3 "$CODEX_HOME/skills/data-substrate/scripts/initialize-session-scratchpad.py" \
  --cwd "$(pwd)" \
  --session-id "$SESSION_ID"

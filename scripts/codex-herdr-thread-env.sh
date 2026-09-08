#!/usr/bin/env bash

# Sourced by Codex command shells. The Node resolver prints shell-quoted exports
# only when CODEX_THREAD_ID maps to one unique live Herdr pane.
if [[ -n "${CODEX_THREAD_ID:-${CODEX_SESSION_ID:-}}" ]]; then
  _codex_herdr_home="${CODEX_HOME:-$HOME/.codex}"
  _codex_herdr_exports="$(
    /usr/bin/env node \
      "$_codex_herdr_home/scripts/codex-herdr-thread-env.mjs" \
      2>/dev/null
  )"
  if [[ -n "$_codex_herdr_exports" ]]; then
    eval "$_codex_herdr_exports"
  fi
  unset _codex_herdr_home _codex_herdr_exports
fi

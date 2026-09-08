#!/bin/sh
set -eu

base=${1:-}
head=${2:-}

if [ -z "$base" ] || [ -z "$head" ]; then
  printf '%s\n' 'usage: branch-policy-check.sh <base-branch> <head-branch>' >&2
  exit 2
fi

allow() {
  printf 'branch_policy=allowed\nbase=%s\nhead=%s\n' "$base" "$head"
  exit 0
}

deny() {
  printf 'branch_policy=denied\nbase=%s\nhead=%s\nreason=%s\n' "$base" "$head" "$1" >&2
  exit 1
}

case "$base" in
  main)
    case "$head" in staging|HOTFIX/*) allow ;; esac
    deny 'main accepts only staging promotion or an explicit hotfix'
    ;;
  staging)
    case "$head" in development|HOTFIX/*) allow ;; esac
    deny 'staging accepts development promotion or an active-release hotfix forward-port'
    ;;
  development)
    case "$head" in */integration|HOTFIX/*) allow ;; esac
    deny 'development accepts an integration branch or reviewed hotfix forward-port'
    ;;
  */integration)
    prefix=${base%/integration}
    case "$head" in "$prefix"/*)
      [ "$head" = "$base" ] && deny 'a branch cannot promote into itself'
      allow
      ;;
    esac
    deny 'integration accepts only work in its own Epic or department namespace'
    ;;
  *)
    case "$head" in "$base"_*) allow ;; esac
    deny 'a Task accepts only its own suffixed Subtask; employee repair bases require an execution-envelope policy check'
    ;;
esac

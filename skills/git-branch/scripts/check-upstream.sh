#!/bin/sh
set -eu

repository=${1:-.}

if ! git -C "$repository" rev-parse --git-dir >/dev/null 2>&1; then
  printf '%s\n' 'git_preflight=not_a_repository'
  exit 2
fi

branch=$(git -C "$repository" branch --show-current)
head_sha=$(git -C "$repository" rev-parse HEAD)
upstream=$(git -C "$repository" rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null || true)
status=$(git -C "$repository" status --porcelain=v1 --untracked-files=all)
tracked_count=$(printf '%s\n' "$status" | awk 'NF && substr($0,1,2) != "??" { count++ } END { print count+0 }')
untracked_count=$(printf '%s\n' "$status" | awk 'substr($0,1,2) == "??" { count++ } END { print count+0 }')

has_origin=false
if git -C "$repository" config --get remote.origin.url >/dev/null 2>&1; then
  has_origin=true
fi

live_ref() {
  ref=$1
  if [ "$has_origin" = false ] || [ -z "$ref" ]; then
    return 0
  fi
  git -C "$repository" ls-remote --heads origin "refs/heads/$ref" 2>/dev/null |
    awk 'NR == 1 { print $1 }'
}

remote_current=$(live_ref "$branch")
remote_development=$(live_ref development)
remote_staging=$(live_ref staging)
remote_main=$(live_ref main)

current_relation=unavailable
if [ -n "$branch" ] && [ "$has_origin" = true ]; then
  if [ -z "$remote_current" ]; then
    current_relation=remote_absent
  elif [ "$remote_current" = "$head_sha" ]; then
    current_relation=exact
  else
    current_relation=different
  fi
fi

branch_class=detached
if [ -n "$branch" ]; then
  case "$branch" in
    main|staging|development) branch_class=canonical ;;
    */integration) branch_class=integration ;;
    HOTFIX/*) branch_class=hotfix ;;
    */*_* ) branch_class=subtask_or_scoped_work ;;
    */*) branch_class=task_or_employee ;;
    *) branch_class=unclassified ;;
  esac
fi

printf 'git_preflight=ok\n'
printf 'branch=%s\n' "$branch"
printf 'branch_class=%s\n' "$branch_class"
printf 'head=%s\n' "$head_sha"
printf 'upstream=%s\n' "$upstream"
printf 'tracked_changes=%s\n' "$tracked_count"
printf 'untracked_changes=%s\n' "$untracked_count"
printf 'origin_configured=%s\n' "$has_origin"
printf 'remote_current=%s\n' "$remote_current"
printf 'remote_relation=%s\n' "$current_relation"
printf 'remote_development=%s\n' "$remote_development"
printf 'remote_staging=%s\n' "$remote_staging"
printf 'remote_main=%s\n' "$remote_main"

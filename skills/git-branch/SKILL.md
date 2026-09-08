---
name: git-branch
description: >-
  Enforce the owner-ratified Git branch hierarchy, worktree isolation, upstream
  synchronization, merge promotion, hotfix continuity, and employee-managed Git
  flow. Use when starting or resuming change-bearing repository work, creating or
  reconciling branches/worktrees, preparing commits or pull requests, promoting
  releases, handling dirty state, or automating Git for nontechnical employees.
---

# Git Branch

Operate Git for the human while preserving one auditable upward hierarchy. This
skill is GitHub-first and Jira-ID-aware, but Jira ticket creation and lifecycle
belong to a separate Jira skill.

## Begin every Git operation with authority and facts

1. Read the nearest repository instructions and contribution documentation.
2. Inspect `git status`, current branch, `HEAD`, configured upstream, worktrees,
   and live remote refs before a change-bearing Git operation.
3. Run [`scripts/check-upstream.sh`](scripts/check-upstream.sh) for a read-only
   opening snapshot. Its result is evidence, not permission to mutate.
4. Load `.agent/identity.json` when present. Never print secrets or remote URLs
   containing credentials.
5. Determine the route:
   - technical Jira work → [core policy](references/core-policy.md);
   - employee-managed work → [employee extension](references/employees.md);
   - production repair → [hotfix protocol](references/hotfixes.md).
6. Stop when authority, ownership, task ID, base branch, or dirty-state custody
   is ambiguous. Do not invent an issue ID or widen the task.

## Canonical branches

```text
main        production and released state
staging     release candidate and final QA
development shared integration
```

No implementation occurs directly on a canonical branch. Normal promotion is:

```text
<EPIC>/<TASK>_<subtask>
  → <EPIC>/<TASK>
  → <EPIC>/integration
  → development
  → staging
  → main
```

Use uppercase Epic and Task IDs. Use a lowercase subtask suffix. A branch named
only `<EPIC>` is forbidden because it conflicts with `<EPIC>/...` refs in the
supported Git storage model.

## Worktree rule

Every change-bearing task uses an isolated worktree. Attach a detached Codex
worktree to its assigned branch before mutation. For an interactive
nontechnical employee, keep the conversation in its existing workspace and
create a local `./.worktrees/` worktree; do not fork the employee into a new
Codex conversation merely to obtain isolation.

One repository write lease owns branch switches, stash operations, and local
merges. Do not mutate a checkout from under another active agent.

## Dirty-state cycle

When authorized synchronization encounters tracked or untracked work:

1. Inventory the paths and confirm ignored or sensitive files will not enter
   Git object storage.
2. Under the repository write lease, stash tracked and untracked changes with
   an attributable task/thread message.
3. Record the exact stash object and entry before updating the branch. Never
   rely on an unrecorded `stash@{0}` in a multi-worktree repository.
4. Fetch and update using the route's permitted strategy. Never rewrite a
   canonical, integration, employee, or other shared branch.
5. Pop only the recorded stash entry.
6. **On pop: reconcile.** Inspect conflicts, status, and the full resulting diff;
   preserve both upstream intent and owned local work. Never discard either side
   merely to complete the operation.
7. Rerun affected validation after reconciliation.

If ignored/sensitive content, uncertain ownership, an existing conflict, or a
missing write lease prevents safe stashing, stop and report the blocker.

## Validation and delivery

- Use the repository's pinned package manager and resolved task runner.
- Run applicable tests, lint, typecheck, build, and acceptance targets.
- For an application or server, also prove boot/render success and perform a
  small representative interaction before shutdown when safe and supported.
- Never push a red candidate.
- Validate Conventional Commit messages with the repository's commitlint rules.
- Agents may commit, push the owning task branch, and open a PR when authorized.
- Only an explicitly authorized technical release authority merges or promotes.
- Use merge commits at every hierarchy boundary; do not require linear history.
- Never force-push or bypass hooks.

Use the human-readable templates under [`assets/`](assets/). PR text stays
short: what changed, why, validation, base/target, and remaining risk. Machine
evidence may be linked rather than pasted.

## Cleanup

After the owning PR is merged and evidence is secured:

1. Import only allowlisted durable `.agent/` documents and evidence. Never
   import runtime state, databases, sockets, logs, credentials, or secrets.
2. Verify the merged commit is reachable from its intended parent branch.
3. Remove only the task worktree and branch owned by this assignment.
4. Prune stale worktree metadata.
5. Preserve canonical, Epic integration, department integration, and employee
   branches.

Do not clean resources owned by another task or person.

## Bootstrap and enforcement

Repository adoption starts with read-only discovery and an explicit report.
An authorized technical user approves topology changes. A repository that has
opted into employee automation may normalize a nontechnical employee workspace
automatically through an exact Codex App Server execution envelope.

When canonical branches are absent and creation is authorized, create
`development` and `staging` atomically at the verified live `origin/main` SHA.
Never rewind an existing branch.

Use GitHub rulesets, required checks, CODEOWNERS, and environments when the plan
supports them. When server-side protection is unavailable, install Actions
checks and state clearly that agent instructions are defense in depth, not
equivalent enforcement.

## Resources

- [Accepted governance ADR](references/ADR-001-git-branch-governance.md)
- [Core technical topology](references/core-policy.md)
- [Atlantis employee extension](references/employees.md)
- [Production hotfix protocol](references/hotfixes.md)
- [Read-only upstream preflight](scripts/check-upstream.sh)
- [Identity example](assets/identity.example.json)
- [Execution envelope example](assets/execution-envelope.example.json)
- [Issue template](assets/issue-template.md)
- [PR template](assets/pr-template.md)
- [Preflight report template](assets/preflight-report.md)
- [Hotfix report template](assets/hotfix-report.md)

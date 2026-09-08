# ADR-001: Hierarchical Git Branch Governance

**Status:** Accepted

**Decision date:** 2026-09-04
**Authority:** Repository owner rulings captured through the Git-branch policy discussion

## Context

Multiple humans and coding agents work concurrently, including nontechnical
employees who must not be responsible for Git mechanics. Work needs durable
issue identity, isolated worktrees, reviewable promotion, clean production
history, and automatic recovery without allowing an agent to bypass the branch
hierarchy.

Git reference names also impose a structural constraint. With supported Git
ref behavior, a branch such as `AES-13` cannot coexist with
`AES-13/AES-45`. Long-lived Epic and department branches therefore use the
leaf name `integration`.

## Decision

### Canonical branches

```text
main        production and released state
staging     release candidate and final QA
development shared integration
```

No implementation occurs directly on these branches. Promotion uses reviewed
merge commits in this order:

```text
development → staging → main
```

### Technical Jira hierarchy

```text
<EPIC-ID>/<TASK-ID>_<subtask-id>
  → <EPIC-ID>/<TASK-ID>
  → <EPIC-ID>/integration
  → development
  → staging
  → main
```

Epic and Task identifiers are uppercase. A subtask suffix is lowercase. Every
task has a corresponding issue. Subtask-to-task integration may be performed
as a validated local merge. Task-to-Epic and every higher promotion use a
reviewed pull request. The Epic promotes only after an explicit
`EPIC_COMPLETE` verdict; the repository's feature or version bump belongs to
that Epic-complete merge boundary.

### Employee hierarchy

```text
local task worktree or temporary bridge
  → <department>/<employee>
  → <department>/integration
  → development
  → staging
  → main
```

The agent owns Git mechanics for a nontechnical employee. A temporary bridge
may exist only on the employee branch, must stay green, and must be replaced by
a J5-owned repair before promotion into department integration.

### Worktrees

Every change-bearing task uses an isolated worktree. A detached worktree is
attached to its owning branch before mutation. Nontechnical employees remain in
their existing conversation; their agent creates and operates a local
`./.worktrees/` checkout rather than moving the employee into a new Codex
conversation.

### Dirty-state recovery

The standard recovery is an attributable automatic stash cycle under a
repository write lease:

1. Inventory tracked, untracked, ignored, and sensitive paths.
2. Stash tracked and untracked work and record the exact stash object.
3. Update the permitted base without rewriting a shared branch.
4. Pop only the recorded stash entry.
5. On pop, reconcile the complete resulting diff and every conflict.
6. Rerun affected validation.

Ignored or sensitive files never enter the stash merely to make synchronization
convenient. Unsafe custody stops the update.

### History

Merge commits are used at every hierarchy boundary. Linear-history enforcement
is disabled. Force-push and shared-history rewriting remain prohibited.

### Hotfixes

Emergency work begins at `HOTFIX/<HOTFIX_HASH>` from `main` and reaches `main`
through review. The exact patch is then forward-ported through reviewed branches
based on `development` and, when required by an active release, `staging`.
Shared canonical branches are never rebased onto `main`. Active tasks rebase
onto the updated `development` and run affected validation.

### Authority

Agents may create isolated worktrees, implement, validate, commit, push their
owning task branch, and open pull requests when the assignment authorizes those
actions. An explicitly authorized technical release authority performs merges
and promotion. Direct canonical commits are blocked; break-glass work is
explicit, narrow, and auditable.

## Consequences

- Every production change has a visible upward path.
- Epic and department work can receive many task PRs without Git ref conflicts.
- Merge commits preserve corporate integration boundaries.
- Worktree and branch cleanup become agent responsibilities after merge and
  evidence retention.
- Nontechnical employees can continue working without learning Git operations.
- Temporary bridges create controlled technical debt and therefore require an
  immediate issue, owner, marker, replacement, and promotion block.
- Hotfixes require explicit forward-port work so a later release cannot erase a
  production repair.
- GitHub Actions can detect violations, but server-side rulesets remain the
  stronger enforcement layer when the repository plan supports them.

## Alternatives considered

### Branch named only `<EPIC-ID>`

Rejected because it cannot coexist portably with `<EPIC-ID>/<TASK-ID>`.

### Direct task PRs into `development`

Rejected for multi-task Epics because it removes the Epic-complete integration
gate.

### Linear history and squash-only promotion

Rejected because the owner chose merge commits as durable hierarchy boundaries.

### Generic stash–pull–pop without identity

Rejected. The accepted stash cycle records the exact stash object, runs under a
write lease, excludes unsafe content, and requires reconciliation after pop.

### No hotfix propagation

Rejected because later development promotion could remove or regress a repair
present only on `main`.

### Unbounded employee bridges

Rejected because a bridge must never reach department integration without
purification.

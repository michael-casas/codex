# Core Technical Branch Policy

Read this reference for ordinary technical, Jira-identified, worktree, commit,
PR, merge, and release operations.

## Naming

| Role | Pattern | Example |
|---|---|---|
| Epic integration | `<EPIC>/integration` | `AES-13/integration` |
| Task | `<EPIC>/<TASK>` | `AES-13/AES-45` |
| Subtask | `<EPIC>/<TASK>_<subtask>` | `AES-13/AES-45_parser` |
| Hotfix | `HOTFIX/<HOTFIX_HASH>` | `HOTFIX/a81c23f` |

Do not create `<EPIC>` as a branch. Do not invent Jira identifiers. The Jira
integration skill owns ticket creation and lifecycle; this skill consumes
ratified IDs.

## Start

1. Run the read-only preflight.
2. Verify the issue, branch owner, write surface, and intended PR base.
3. Fetch before creating a task branch.
4. Start an Epic integration branch from current `development` when the Epic is
   first admitted.
5. Start each Task from the current Epic integration branch unless the compiled
   assignment declares and justifies another reviewed base.
6. Start each Subtask from its current Task branch.
7. Create a distinct worktree for every change-bearing task or subtask.

## Synchronize

- Rebase only a short-lived, privately owned Task or Subtask branch.
- Never rebase `main`, `staging`, `development`, an Epic integration branch, a
  department integration branch, or an employee branch.
- Before mutation and before declaring ready, compare the owning base with the
  live remote.
- If upstream already contains the fix, stop implementation and record evidence.
- If upstream changed, preserve dirty state through the accepted stash cycle,
  update the base, rebase the short-lived branch, pop and reconcile, then rerun
  validation.

## Integrate

```text
Subtask → Task
```

A validated local merge commit is allowed. Preserve issue attribution and run
the Task's affected checks after the merge.

```text
Task → Epic integration
```

Push the Task and open a reviewed PR. After merge, create the next Task from the
updated Epic integration branch.

```text
Epic integration → development
```

Require an explicit `EPIC_COMPLETE` verdict, complete affected closure, boot or
render evidence where applicable, and a reviewed merge commit. Apply the
repository's feature or version bump at this Epic-complete merge boundary, not
on every Subtask or intermediate Task merge.

```text
development → staging → main
```

Each arrow is a separate reviewed promotion. Production originates only from
`main`.

## Authority and bypass

Conversational identity may select the technical interaction mode but never
grants credential authority. GitHub authentication and explicit task authority
govern merges, settings, deployment, and break glass. Agents do not commit
directly to canonical branches.

## Cleanup

After merge and evidence capture, delete the owned Task/Subtask branch and
worktree. Preserve every integration and canonical branch. Confirm reachability
before cleanup and never remove another execution's resource.

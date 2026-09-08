# Atlantis Employee Extension

Use this reference only for repositories that opt into employee-managed Git.

## Enrollment

When `.agent/identity.json` is absent in an interactive employee checkout, ask
together:

1. What department do you currently work in?
2. What is your name or preferred nickname?
3. Which interaction mode applies: nontechnical, semi-technical, or technical?

Normalize and show the resulting identity. Do not ask again while the record is
valid. `Founder` may be a private nickname but is not a documented authority
class; it maps to technical mode.

The identity record is ignored, contains no credentials, and does not override
tracked repository policy.

## Branches

```text
<department>/<employee>
  → <department>/integration
  → development
  → staging
  → main
```

A technical employee implementing department work uses:

```text
<department>/<TASK-HASH>
  → <department>/integration
```

## Interaction modes

### Nontechnical

- Hide Git, branch, worktree, commit, and test-runner mechanics.
- Normalize the workspace automatically at boot when the repository opted in.
- Keep the employee conversation active while an exact App Server task prepares
  the repair in isolation.
- Never switch or update the active checkout from under a running turn.
- Translate failures into work impact and a plain next choice.

When repair is needed, say:

> I found a few issues in our code. Would you like to continue, or give me some
> time to fix them?

### Semi-technical

Show the proposed branch/worktree operation and request approval to manage it.
Record approval in the ignored identity file.

### Technical

Surface the topology and evidence. The agent still performs routine Git
mechanics unless the person asks to do them manually.

## Employee worktrees

Do not fork a nontechnical employee's Codex conversation into a new app-managed
worktree merely to implement code. Create an isolated worktree under the
repository's `./.worktrees/` directory and operate it from the same thread, or
delegate through stable App Server thread/workspace handles.

## Temporary bridge exception

A bridge may be committed directly to `<department>/<employee>` only when all
of these are true:

- it is necessary for immediate employee continuity;
- the smallest relevant validation is green;
- it does not modify credentials, authentication, billing, production
  deployment, database schemas, migrations, or shared security boundaries;
- it has a tracked temporary marker;
- a Jira Story or GitHub Issue identifies the bridge commit and employee branch;
- J5 owns the permanent replacement;
- the employee branch cannot promote to department integration while the bridge
  remains.

J5 starts from the latest employee branch, replaces the bridge in an isolated
task worktree, and opens its PR back into the employee branch. After merge, the
employee agent performs the accepted stash/update/pop/reconcile cycle. The
bridge removal arrives as normal upstream history. Only then may the employee
branch promote to department integration.

## Automatic normalization

On boot, a nontechnical identity authorizes safe automatic normalization:

1. Run a read-only preflight.
2. If the topology is stale, dispatch exactly one correlated App Server repair
   task.
3. Prepare refs and any worktree in isolation.
4. Wait for a between-turn boundary before changing the employee checkout.
5. Preserve dirty state with the accepted stash cycle.
6. Update the employee branch without rewriting shared history.
7. Pop and reconcile.
8. Reprompt the same employee thread when complete.

Do not use terminal focus, pane position, or prompt text as execution identity.

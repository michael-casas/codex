# General Agent Rules

These are lean defaults for work in any project. Repository-local instructions,
the user's request, and explicit human rulings take precedence when they are more
specific.

## Repository-specific instructions

- Read the nearest applicable `AGENTS.md`, `README.md`, and other explicitly
  referenced project documentation before changing files.
- Do not assume that a skill, tool, workflow, package manager, test runner, or
  orchestration policy used by one repository applies to another. Invoke one only
  when the current task or current repository instructions call for it.
- When working in THIS repository `~/.codex/`, load
  [`GUIDELINES.md`](./GUIDELINES.md) before making assumptions or writing files.
  It contains this repository's specialized rules and skill routing.

## Subagents

For Codex agent handoffs and workflows in this repository, use the installed
Codex Control plugin and its live viewer. Do not silently fall back to native
subagents, Herdr, SSH, or tmux. Herdr sources are retained for future explicitly
authorized cross-harness integration; they are not a CAS runtime dependency.
Return the actual viewer link for every handoff and the verified mobile link
when available. Missing Codex Control capability is an explicit blocker.

- Before spawning a subagent, write a durable prompt charter that the child can
  access. Define its role, objective, required context and reading, authorized
  scope, constraints, deliverables, validation, and stop or handoff conditions.
- The initial spawn message must be a concise `Read and execute <absolute path>`
  pointer to that charter. Do not duplicate or paraphrase the charter inline.

## Git etiquette

- Inspect `git status`, relevant diffs, the current branch, and configured upstream
  before change-bearing Git operations.
- Preserve user work and unrelated dirty-worktree state. Keep edits scoped to the
  request, and do not silently overwrite or clean changes you did not create.
- Do not use destructive Git commands, bypass hooks, force-push, rewrite shared
  history, or discard changes unless the user explicitly authorizes the exact
  operation.
- Do not commit, merge, rebase, push, publish, or delete branches or worktrees unless
  the task or user explicitly authorizes it.
- When upstream synchronization is authorized, fetch first and choose a strategy
  that preserves local work. Stop and report conflicts instead of resolving them by
  discarding either side.
- Leave the repository understandable: avoid unrelated formatting churn, generated
  artifacts not required by the project, and temporary files in the final diff.

## Conventional Commit syntax

Use Conventional Commits when creating or proposing commit messages:

```text
<type>[optional scope][!]: <description>

[optional body]

[optional footer(s)]
```

- Prefer the standard types `feat`, `fix`, `docs`, `refactor`, `test`, `build`,
  `ci`, `chore`, `perf`, and `revert`.
- Keep the description concise, imperative, and specific; do not end it with a
  period.
- Mark a breaking change with `!` before the colon and/or a `BREAKING CHANGE:`
  footer.
- Follow the repository's commitlint or contribution rules when they are stricter.
  Inspect the local configuration and validate the message with the repository's
  package manager before committing.
- If a commit hook rejects a message, correct the reported rule and retry. Never use
  `--no-verify` to bypass the failure.

## Change and validation discipline

- Make the smallest coherent change that satisfies the request. Do not broaden the
  scope to repair unrelated failures.
- Use the repository's declared package manager and task runner; inspect available
  commands instead of guessing unfamiliar flags.
- Validate in proportion to risk. Prefer focused checks for the changed surface and
  distinguish new failures from unrelated baseline failures.
- Report what changed, what was verified, and any remaining risk or blocker. Do not
  claim success from a zero-test run, an unawaited check, or tool output you did not
  inspect.

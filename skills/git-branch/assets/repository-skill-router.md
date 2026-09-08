---
name: git-branch
description: >-
  Apply the repository's approved Git branch, worktree, employee, PR, merge,
  hotfix, and cleanup policy. Use before any change-bearing Git operation.
---

# Repository Git Branch Router

This repository opts into the `git-branch` governance contract.

1. Read the repository's tracked Git governance ADR and nearest `AGENTS.md`.
2. Load `.agent/identity.json` when present; the file is local, ignored, and
   contains no credentials.
3. Use the installed global `$git-branch` skill when available.
4. When the global skill is unavailable, follow the tracked repository copy of
   the accepted topology and employee extension. Do not weaken enforcement or
   guess missing policy.
5. Run the repository's read-only upstream preflight before mutation.
6. Never implement directly on `main`, `staging`, `development`, or an
   `*/integration` branch.

Repository-local instructions and explicit human rulings remain authoritative
over generic skill defaults.

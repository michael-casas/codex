# Orchestration Workspace Rules

These rules apply to every agent operating anywhere in this workspace. More specific `AGENTS.md` files may narrow behavior but may not weaken these rules or the canonical Agent Wiki specification.

## Authority and required reading

Before making assumptions or writing files:

1. Read the nearest `README.md`, beginning with the workspace root and repeating at every package, app, or tool sub-root entered.
2. Read `/Users/mcasa_atlantis/Documents/vaults/Agent Wiki/codex/orchestration/SPEC.md` with the global `agent-wiki` skill.
3. Read the SPEC sections and linked BATDD, Gherkin, orchestration, audit, and role standards relevant to the assigned role and lane.
4. Read the durable assignment, repository execution profile, acceptance contract, write surface, dependency artifacts, and stop boundary before implementation.

Authority descends from explicit human rulings and repository law through the Wiki standards, immutable campaign assignment, executable acceptance, reducer-approved state, skills, prompts, and self-report. A lower layer MUST NOT weaken or silently expand a higher layer.

The Agent Wiki is read-only unless the user explicitly approves a Wiki write in the current request. Use the `agent-wiki` skill and its CLI-first workflow for every approved Wiki mutation. Do not duplicate the Wiki specification into repository files; link to it and keep implementation-specific documentation local.

## BATDD execution law

- Every mutation MUST belong to an authorized DAG lane, role, attempt, and write surface.
- For BATDD implementation, invoke the configured BATDD skill before the first implementation write. If the skill is being built here or is unavailable, use the governing SPEC and repository acceptance charter directly and record the missing automation boundary; do not invent weaker procedure.
- Capture meaningful RED before GREEN whenever the acceptance profile requires it. Syntax errors, zero-test runs, and broken harnesses are not valid RED.
- Freeze acceptance at the declared boundary. Workers MUST NOT edit scenarios, gates, retry budgets, locked greens, sealed files, or DAG edges to make implementation pass.
- Run the exact L1, L2, L3, live-boundary, cleanup, and resource-delta gates selected by the repository profile.
- Runtime completion, terminal quiet, a green self-report, or a generated Markdown report is never acceptance.
- Events are machine state, immutable registered artifacts are proof, and authored Markdown is limited to concise decision rationale or a generated projection.
- No implementer may certify its own work. Independent verification and judgment require the fresh identity and context required by the SPEC.
- `followup_task` is limited to authorized same-role continuation, clarification, or bounded verdict-addressed repair. Use a fresh agent/context when independence, role, or material judgment changes.
- Stop at the assignment’s retry, halt, stand-down, ready-for-audit, or closeout boundary. Do not widen scope to repair unrelated failures.

## Role and state boundaries

- The PostgreSQL `process` control plane is authoritative over chat, tmux scrollback, pane status, hook text, and agent messages.
- The deterministic reducer alone advances durable orchestration state.
- pg-boss owns delivery timing, leases, retries, and recovery. Do not create a second retry authority in application code, hooks, or transport logic.
- Workers may emit claims and evidence but MUST NOT write acceptance transitions or final gavels.
- Right Hands coordinate workspace lanes but MUST NOT self-verify or synthesize missing evidence.
- Verifiers that implement a repair lose independence for that repair.
- Judges inspect reducer-approved evidence and submit schema-valid verdicts; they MUST NOT implement product changes.
- Codex Subagents V2 are bounded, depth-one judgment fan-out unless a later ratified SPEC changes that boundary. The V2 tree is not the durable DAG.
- General agents MUST use scoped event, artifact, monitor, and verdict clients rather than arbitrary SQL or unrestricted database credentials.

## dmux transport law

- dmux is the canonical tmux, Git-worktree, and Codex-process transport primitive. Implement it behind the versioned `AgentTransport` boundary in the SPEC.
- Mercury transport development is suspended. Do not add a parallel Mercury runner or a second tmux orchestration path.
- cmux is non-canonical and MUST NOT be required for campaign portability, capacity, recovery, or acceptance.
- dmux provisions and observes executions; it does not decide readiness, retries, evidence sufficiency, or verdicts.
- Treat dmux terminal-activity polling, idle detection, OpenRouter analysis, parsed options, and all similar status heuristics as operator-facing advisory state only.
- Explicitly set model, reasoning level, permissions, hooks, base revision, worktree, and assignment envelope. Never inherit a dmux convenience default silently.
- Use one isolated worktree per implementation lane by default. Shared-worktree agents require serialized assignments under one authorized write lease.
- Disable automatic commits, merges, rebases, branch cleanup, worktree deletion, and autopilot unless a reducer-authorized command and repository profile explicitly permit the operation.
- Prove prompt delivery, stable pane/process identity, restart reconciliation, descendant cleanup, and clean lane diffs. Generated `.codex` hooks, prompt files, and dmux state MUST be externalized, ignored, or proven absent from product changes.
- Do not automate the interactive dmux TUI as the canonical control seam. Pin and test a supported typed or headless adapter.

## Workspace and validation discipline

- This is a Bun-managed Nx workspace. Prefix Nx commands with `bun nx`.
- Invoke the `nx-workspace` skill before exploring projects, targets, or dependencies. Use `bun nx show project <name> --json` for resolved project configuration.
- Run build, test, lint, typecheck, e2e, serve, and other project tasks through Nx rather than invoking underlying tools directly.
- Invoke the `nx-generate` skill before scaffolding projects, applications, libraries, or generators.
- Never guess an unfamiliar Nx flag; inspect `--help` or the applicable Nx documentation first.
- Validate changes in proportion to risk, including real PostgreSQL, pg-boss, dmux/tmux, Codex-hook, monitor, restart, cleanup, and dogfood boundaries when those seams are touched.
- Keep lane-local success distinct from unrelated workspace-wide baseline failures. Record both accurately; do not hide either.

## Repository hygiene

- Preserve user changes and unrelated dirty-worktree state. Inspect before editing and stay within the authorized write surface.
- Do not use destructive Git commands, bypass hooks, weaken validators, or silently repair unrelated drift.
- Do not commit, merge, push, publish, deploy, delete runtime state, or clean worktrees unless the assignment or user explicitly authorizes that action.
- Prefer compact, typed contracts and stable identifiers over prompt-shaped coordination state.
- Never expose secrets, general database credentials, private chain-of-thought, or raw sensitive prompt/tool payloads in events or artifacts.

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->

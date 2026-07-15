# Codex Orchestration

This Nx workspace implements the event-driven, BATDD-governed Codex orchestration system. It is the implementation surface for the process control plane, pg-boss delivery, monitor service, dmux transport integration, Codex lifecycle hooks, and the role-scoped interfaces used by Coordinators, Right Hands, Workers, Verifiers, and Judges.

The workspace does not own the architecture constitution. Durable doctrine and architecture live in the shared Agent Wiki.

## Canonical documentation

Start with the [Codex Event-Driven BATDD Orchestration SPEC](obsidian://open?vault=Agent%20Wiki&file=codex%2Forchestration%2FSPEC).

- Vault: `Agent Wiki`
- Note: `codex/orchestration/SPEC.md`
- Filesystem: `/Users/mcasa_atlantis/Documents/vaults/Agent Wiki/codex/orchestration/SPEC.md`

Read it from the command line with:

```sh
obsidian vault="Agent Wiki" read path="codex/orchestration/SPEC.md"
```

The SPEC routes to the governing BATDD, Gherkin, orchestration, audit, and role standards. Repository source is authoritative for concrete implementation; the Agent Wiki is authoritative for cross-project doctrine and architecture. Do not copy the full SPEC into this repository or create a second mutable architecture ledger.

Agent Wiki notes are readable by agents. Editing, creating, moving, renaming, or deleting a Wiki note requires explicit user approval and the global `agent-wiki` skill.

## Architecture snapshot

- PostgreSQL `process` data is the durable source of campaign, DAG, execution, event, artifact, and verdict truth.
- pg-boss is the single delivery, lease, and retry authority.
- The canonical monitor awaits reducer-approved logical events and resumes higher-level Codex work only at decision boundaries.
- dmux is the canonical tmux, worktree, and Codex-process transport primitive behind a versioned adapter.
- cmux is non-canonical; Mercury transport development is suspended.
- Codex Subagents V2 are bounded judgment fan-out, not the durable campaign DAG.
- Runtime completion is an observation. Only executable acceptance, independent verification, and authorized verdict reduction can accept work.

The canonical details and exceptions remain in the Wiki SPEC.

## Workspace projects

| Project                     | Purpose                    | Principal targets                                             |
| --------------------------- | -------------------------- | ------------------------------------------------------------- |
| `@orchestration/daemon`     | Node orchestration daemon  | `serve`, `build`, `test`, `lint`, `typecheck`, `docker:build` |
| `@orchestration/daemon-e2e` | Daemon boundary acceptance | `e2e`, `lint`, `typecheck`                                    |
| `@orchestration/testing`    | Ground-0 BATDD harness     | `test-l1`, `test-l2`, `test-l3`, `test`, `test-policy`        |

Inspect the resolved Nx configuration rather than guessing from package files:

```sh
bun nx show projects
bun nx show project @orchestration/daemon
bun nx show project @orchestration/daemon-e2e
```

## Common commands

```sh
# Develop and build the daemon
bun nx serve @orchestration/daemon
bun nx build @orchestration/daemon

# Run project gates
bun nx test @orchestration/daemon
bun nx lint @orchestration/daemon
bun nx typecheck @orchestration/daemon

# Run real daemon boundary acceptance
bun nx e2e @orchestration/daemon-e2e

# Run the complete uncached Ground-0 closure
bun run ground-zero
```

Read [AGENTS.md](./AGENTS.md) before changing the workspace. It defines the operating rules and required authority boundaries for every Codex agent working here.

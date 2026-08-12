# Orchestration Workspace Rules

These rules apply to every agent operating anywhere in this workspace. More specific `AGENTS.md` files may narrow behavior but may not weaken these rules or the canonical Agent Wiki specification.

## Authority and required reading

Before making assumptions or writing files:

1. Read the nearest `README.md`, beginning with the workspace root and repeating at every package, app, or tool sub-root entered.
2. Determine the role-specific context path before loading broad doctrine.
3. An ordinary Worker with a schema-valid compiled assignment MUST invoke the global `batdd` skill and read `.agents/batdd/WORKER-CONTRACT.md`, `.agents/batdd/profile.json`, and its named assignment envelope. Read repository `TESTING.md` or full Wiki doctrine only on the compiled profile's escalation conditions.
4. Coordinators, contract authors, Verifiers, Judges, agents amending doctrine, and agents resolving a missing, invalid, stale, version-conflicted, or ambiguous compiled contract MUST read `/Users/mcasa_atlantis/Documents/vaults/Agent Wiki/codex/orchestration/SPEC.md` and the relevant linked standards with the `agent-wiki` skill.
5. Read the durable assignment, acceptance contract, write surface, dependency artifacts, immutable revisions, and stop boundary before implementation.

Authority descends from explicit human rulings and repository law through the Wiki standards, immutable campaign assignment, executable acceptance, reducer-approved state, skills, prompts, and self-report. A lower layer MUST NOT weaken or silently expand a higher layer.

The Agent Wiki is read-only unless the user explicitly approves a Wiki write in the current request. Use the `agent-wiki` skill and its CLI-first workflow for every approved Wiki mutation. Do not duplicate the Wiki specification into repository files; link to it and keep implementation-specific documentation local.

## Testing authority and layer ownership

Before creating, editing, moving, or classifying any test:

1. Invoke the global `batdd` skill.
2. Read `.agents/batdd/WORKER-CONTRACT.md`, validate `.agents/batdd/profile.json`, and load the named assignment envelope when present.
3. Read repository [TESTING.md](./TESTING.md) or canonical Wiki standards when the compiled profile declares escalation.
4. Inspect the resolved Nx project and targets before selecting a runner.

Layer ownership is fixed:

- L1 owns unit and in-process integration tests in `*.test.ts` through Vitest.
- L2 owns real-boundary integration and end-to-end tests. Non-UI TypeScript uses Vitest `*.spec.ts`, web uses Playwright `*.spec.ts`, and mobile uses Maestro `*.spec.yaml`.
- L3 owns canonical `*.feature` behavior executed through Cucumber `*.steps.ts` and direct runtime-appropriate dogfood.
- L3 step definitions MUST NOT invoke L1 or L2 targets or import their test entrypoints. Layers MAY share framework-neutral fixtures and drivers.
- UI behavior requires a UI-capable runtime. An API or data proxy does not prove rendering, hydration, visibility, or interaction.
- Zero-test success, no-op assertions, unawaited assertions, scenario-order dependency, pending steps, and assertion-free bindings are invalid evidence.
- After the Ground-0 baseline is ratified, run only changed and transitively affected Nx projects unless an explicit full-workspace gate is required.

The Wiki `TESTING` standard defines cross-repository meaning. This repository's `TESTING.md` resolves exact runners, targets, boundaries, affected inputs, and Ground-0 status without duplicating the canonical doctrine.

For implementation or repair, BATDD invocation MUST create and maintain a runtime-native execution plan before the first product write. The plan represents every required L1/L2/L3 obligation, basic-to-adversarial design, all-row meaningful RED, contract freeze, fidelity-ordered GREEN, affected closure, cleanup, evidence, and stop boundary. `vertical-slice` is the default completion scope; a layer-specific assignment MUST NOT claim feature completion.

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
- Project Orchestrators coordinate workspace lanes but MUST NOT self-verify or synthesize missing evidence.
- Verifiers that implement a repair lose independence for that repair.
- A fresh Preflight identity MUST register immutable proof over the exact candidate, including uncached selected gates, machine-readable test artifacts, and cleanup/resource deltas. Valid reducer-approved Preflight proof satisfies deterministic execution evidence; Judges spend their independent pass on semantic completeness, false-green attacks, blockers, and targeted adversarial checks rather than reenacting the same standing suite.
- Judgment Attempt 1 MUST audit every lane and touched surface and produce one complete, tier-escalated retry charter when blocked. After the chartered retry DAG, Judgment Attempt 2 either approves or may activate Founder-ratified T5 Purity Recovery.
- Judges MUST NOT implement product changes before Purity Recovery. A Judge entering Purity Recovery becomes a Judge-Remediator, loses gavel authority for every repair it touches, and MUST be replaced by a fresh successor Judge before final acceptance.
- T5 Purity Recovery is closed-world repair. It may improve only the accepted feature IDs, frozen contracts, findings, code paths, tests, package/integration seams, and write surfaces already registered for that wave. It MUST NOT add a new feature, behavior, package, application, service, transport, domain dependency, DAG edge, infrastructure surface, or write surface; required expansion stops recovery and escalates to the Founder.
- `T0` through `T5` are portable capability and cost tiers, not provider or model identities and not authority roles. Campaign profiles map evaluated models to tiers; assignments separately grant Worker, Preflight, Verifier, Judge, Coordinator, or other authority.
- Every work-bearing wave MUST maintain at least four safe active lanes or carry a dependency-backed parallelism waiver. Activation, dependency-join, failed-only-repair, and gavel-only waves may be narrower.
- Codex Subagents V2 are bounded, depth-one judgment fan-out unless a later ratified SPEC changes that boundary. The V2 tree is not the durable DAG.
- General agents MUST use scoped event, artifact, monitor, and verdict clients rather than arbitrary SQL or unrestricted database credentials.

## Direct tmux transport law

- Direct, orchestration-owned tmux is the canonical Git-worktree and Codex-process transport primitive. Implement it behind the versioned `TmuxAgentTransport` boundary in the SPEC. dmux is not canonical.
- Mercury transport development is suspended. Do not add a parallel Mercury runner or a second tmux orchestration path.
- cmux is non-canonical and MUST NOT be required for campaign portability, capacity, recovery, or acceptance.
- `TmuxAgentTransport` provisions and observes executions; it does not decide readiness, retries, evidence sufficiency, or verdicts.
- Treat terminal-activity polling, idle detection, parsed options, pane text, and all similar status heuristics as operator-facing advisory state only.
- Explicitly set model, reasoning level, permissions, hooks, base revision, worktree, assignment envelope, manifest digest, and transport incarnation. Never inherit an undeclared convenience default silently.
- Use `$CODEX_HOME/manifest.json` for Campaign-Coordinator routing and `<repo>/.codex/orchestration/manifest.json` for project-local target routing. These manifests MUST NOT contain job state, retry state, evidence, verdicts, pg-boss identifiers, or acceptance state.
- Use one isolated worktree per implementation lane by default. Shared-worktree agents require serialized assignments under one authorized write lease.
- Disable automatic commits, merges, rebases, branch cleanup, worktree deletion, and autopilot unless a reducer-authorized command and repository profile explicitly permit the operation.
- Prove prompt delivery, stable pane/process identity, restart reconciliation, descendant cleanup, and clean lane diffs. Generated hook spools, prompt envelopes, scoped credentials, pane metadata, and transport state MUST be externalized, ignored, or proven absent from product changes.
- Create panes with execution-scoped orchestration identity and launch the standardized Codex hooks. Hook callbacks MUST publish through the scoped orchestration CLI; a `Stop` hook is a turn observation and MUST NOT complete or accept a job.
- Do not automate an interactive TUI as the canonical control seam. Pin and test explicit sockets, argv-based tmux commands, and parseable format output.

## Workspace and validation discipline

- This is a Bun-managed Nx workspace. Prefix Nx commands with `bun nx`.
- Invoke the `nx-workspace` skill before exploring projects, targets, or dependencies. Use `bun nx show project <name> --json` for resolved project configuration.
- Run build, test, lint, typecheck, e2e, serve, and other project tasks through Nx rather than invoking underlying tools directly.
- Invoke the `nx-generate` skill before scaffolding projects, applications, libraries, or generators.
- Never guess an unfamiliar Nx flag; inspect `--help` or the applicable Nx documentation first.
- Validate changes in proportion to risk, including real PostgreSQL, pg-boss, direct tmux, routing-manifest, Codex-hook, hierarchical-monitor, restart, cleanup, and dogfood boundaries when those seams are touched.
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

# Usage semantics

- This file defines the shorthand vocabulary Codex uses in local instruction files.
- Read the JSON map as an alias table: translate abbreviated tokens back to their long-form meaning when interpreting directives.
- Prefer the expanded meaning in explanations and code unless the shorthand is already part of a local file format.

## Global Skills

- Use the global `agent-wiki` skill whenever work touches the shared Obsidian Agent Wiki.
- Agents always have read permission on the Agent Wiki, including direct read-only filesystem access to every file under `/Users/mcasa_atlantis/Documents/vaults/Agent Wiki/` (also addressable as `~/Documents/vaults/Agent Wiki/`). The `wiki` CLI is optional for reads; it is not a mandatory read path.
- Primary Agent Wiki discovery files are `/Users/mcasa_atlantis/Documents/vaults/Agent Wiki/Agent Wiki Home.md`, `/Users/mcasa_atlantis/Documents/vaults/Agent Wiki/Skills.md`, and `/Users/mcasa_atlantis/Documents/vaults/Agent Wiki/Standards.md`.
- Agents must ask for explicit user approval before creating, editing, moving, renaming, or deleting any Agent Wiki note.
- Do not open or focus Obsidian.app for reads. Use direct filesystem reads or the `wiki` CLI according to task fit. The explicit read-only filesystem permission here supersedes the skill's CLI-only read requirement; the write-approval boundary remains unchanged.

## Global Data Substrate

- Always use the global `data-substrate` skill whenever a task can benefit from durable or shared state, relational data, SQL, coordination, sessions, graph relationships, dependency traversal, agent memory, retrieval, checkpoints, cross-turn artifacts, or inter-agent handoff.
- Proactively consider the substrate whenever an agent needs to store, query, join, cache, coordinate, relate, remember, deduplicate, synchronize, or inspect local data.
- Route by ownership: localized SQLite for private per-session scratch state, PostgreSQL for durable process/event truth and pg-boss delivery, Redis only for shared Codex V2 subagent orchestration state, and Neo4j for relationship-first traversal.
- Do not use the Codex Redis service for ordinary session scratch state, general application caching, unrelated queues, or non-V2 orchestration.
- Load canonical connection variables from `~/.codex/.env/codex-services.env` without printing, committing, or copying credentials into reports.
- Keep all writes within the user's task scope. Broad skill triggering does not authorize unrelated data collection, persistence, destructive database operations, or deletion of `~/.codex/.volume/`.

## Session Scratchpad

- For substantive work, proactively initialize the current session scratchpad from the active project root with `"${CODEX_HOME:-$HOME/.codex}/skills/data-substrate/scripts/create-session-scratchpad.sh"`.
- Use the resulting `./.agent/sqlite/session-<SESSION_ID>.db` only for the current Codex session. The initializer resolves `CODEX_SESSION_ID` or `CODEX_THREAD_ID` and configures SQLite WAL mode.
- Proactively store values that should survive context compaction: explicit user constraints, verified facts with sources, decisions and rationale, open questions, blockers, checkpoints, artifact paths, important command results, and next actions.
- Record whether an entry is verified, reported, inferred, or hypothetical. Never store an unverified guess as a verified fact, and never store secrets or credentials.
- Read and reconcile the scratchpad after compaction, when resuming long-horizon work, before major decisions, and before claiming completion.
- Global lifecycle hooks initialize the per-session SQLite scratchpad at `SessionStart`, checkpoint it at `PreCompact(manual|auto)`, verify the matching event at `PostCompact(manual|auto)`, and restore bounded active context at `SessionStart(compact)`. Compaction hooks fail closed when the canonical scratchpad cannot be verified. Treat this as a safety net, not a substitute for proactive writes during the turn.
- Keep `survive_compaction = 1` for durable session value. Supersede outdated entries instead of silently rewriting history.
- Apply `PRAGMA foreign_keys = ON`, `PRAGMA busy_timeout = 5000`, and `PRAGMA synchronous = FULL` on every SQLite connection; WAL mode itself persists.
- Never commit the session database or its `-wal` and `-shm` files. The scratchpad supports working memory; it does not replace repository documentation, tests, or PostgreSQL process/event truth.

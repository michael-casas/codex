# Codex Orchestration Framework — PRD

**Status:** Accepted · Layer 1 intent frozen for domain lowering
**Date:** 2026-07-15
**Primary user:** Founder/operator coordinating agent work across repositories
**Architecture authority:** Agent Wiki `codex/orchestration/SPEC.md` v0.5.0
**Next lowering:** Accepted `PRD.md` → `DOMAINS.md`

**Verdict (2026-07-15, Founder):** Define a cross-repository Meta Orchestration bus whose first accepted release is proven through real two-workspace dogfood. Develop this repository under Gherkin BATDD without prescribing BATDD, repository instructions, skills, or another workflow to orchestrated workspaces. Use direct, orchestration-owned tmux rather than dmux; bind Codex lifecycle hooks to exact process executions; and let hierarchical monitors suspend Project Orchestrators, the Wave Judge Coordinator, and the Campaign Coordinator until reducer-approved decision boundaries resolve.

**Amendment (2026-07-15, Founder):** Provide a constrained shared kernel for genuinely reusable types, functions, and utilities, plus a boundary-error contract that preserves package source and causal provenance so failures can be attributed to the code boundary that produced them.

## Problem Statement

Coordinating coding agents across repositories currently depends too heavily on ephemeral model context, prompt-driven polling, terminal heuristics, mutable prose reports, and human babysitting.

These mechanisms do not provide durable answers to critical questions:

- What work was authorized?
- Which role and execution attempt performed it?
- Which repositories, workspaces, files, and resources could that role mutate?
- Which evidence supports a completion claim?
- Did an independent verifier reproduce the claim?
- Did an authorized Judge accept it?
- Which dependencies, leases, retries, and stop boundaries remain active?
- Can the campaign recover after a process, terminal, model, service, or host interruption?
- Can the system prove that an agent did not perform a destructive or unauthorized database action?

Runtime completion is too easily mistaken for accepted work. Agent messages and terminal status can claim success without executable evidence. Delivery retry, implementation repair, verification, and judgment authority can blur together. Expensive coordinator models are repeatedly awakened to poll state that durable software should absorb.

The primary problem is therefore acceptance authority and correctness. Durability and recovery are the second problem. Model and operator efficiency follow from solving the first two correctly.

## Product Vision

Codex Orchestration Framework is a durable Meta Orchestration bus for coordinating agent campaigns across repositories and workspaces.

A Founder should be able to ask the Codex App to orchestrate agents for a declared set of workspaces, describe the desired workflow in the terms appropriate to that work, and let the framework coordinate execution without requiring one prescribed development methodology.

The framework preserves campaign truth independently of any one model, Codex task, terminal pane, worktree, or host process. It resumes expensive reasoning only when durable state reaches a decision boundary that requires coordination, judgment, or human authority.

The first product claim will not be made from architecture alone. The framework must first prove itself through real work, tests, failure, recovery, dogfood, and replication.

## Primary User

The primary user is a Founder or advanced engineering operator coordinating multiple repositories and multiple agent roles.

The primary user needs to:

- describe a bounded workflow across selected workspaces;
- preserve each repository's own instructions, tools, and acceptance approach;
- observe durable campaign state without polling every agent;
- receive only actionable decision-boundary wakes;
- intervene when authority, safety, or retry limits require a human ruling;
- trust that no agent can certify its own implementation;
- trust that database and workspace mutations remain bounded;
- recover work after runtime or host failure;
- reconstruct what happened from durable state and immutable proof;
- produce an evidence-backed final closeout.

## Secondary Users and Roles

Secondary users are orchestration participants operating under explicit roles:

- Campaign Coordinators supervising cross-workspace intent;
- Project Orchestrators coordinating one repository's campaign slice;
- Workers implementing bounded assignments;
- Preflight agents running independent deterministic disproof;
- independent Verifiers attacking reported success;
- Judges issuing authorized semantic verdicts;
- transport and hook witnesses reporting runtime observations;
- operators diagnosing delivery, execution, recovery, or authority failures.

A role defines authority. A model name or cost tier does not.

## Solution

The framework provides a durable control plane between human intent, user-described workflow, repository-local authority, agent execution, independent verification, and final judgment.

It will:

- represent campaigns, workspaces, jobs, dependencies, attempts, executions, evidence, and verdicts durably;
- separate scheduling and delivery from semantic acceptance;
- enforce role, write-surface, retry, and judgment boundaries;
- suspend expensive Coordinator reasoning between decision events;
- recover execution state after agent, terminal, transport, service, and local-host interruptions;
- expose role-scoped operations instead of general database access;
- preserve target-workspace instructions without injecting a prescribed methodology;
- support workflow and acceptance contracts declared for each campaign and workspace;
- preserve immutable proof and generate human-readable projections;
- prevent runtime observations from becoming authoritative acceptance transitions.

The exact runtime packaging—CLI, MCP server, persistent service, Unix-socket endpoint, or composed surfaces—is an architecture-lowering decision. The PRD requires the capabilities, not a predetermined Nx app name. The generated `apps/daemon` scaffold is not product authority.

## Product Principles

### Acceptance before automation

Automation may accelerate delivery but must not weaken acceptance authority.

A Worker may implement and submit evidence. It cannot certify its own work. Runtime completion, hook output, terminal quiet, delivery state, and transport status are observations only.

### Durable state outside model context

Campaign truth must survive:

- context compaction;
- Codex task termination;
- provider interruption;
- terminal loss;
- tmux pane death;
- missing lifecycle hooks;
- service and Docker restart;
- full local-host restart followed by reconciliation.

No model conversation is the canonical campaign ledger.

### One authority per responsibility

The system keeps distinct authority for:

- human intent;
- campaign and workspace workflow contracts;
- orchestration state reduction;
- delivery and retry timing;
- runtime execution;
- independent verification;
- judgment;
- monitoring and wake delivery.

No component may silently assume another component's authority.

### Least privilege by role

Workers, Preflight agents, Verifiers, Judges, transports, monitors, and operators receive different capabilities.

Roles are authority classes, not model identities. A model change does not change a role's permissions.

### Destructive actions denied by default

Production orchestration data is protected against unauthorized deletion, truncation, general mutation, and schema changes.

Testing uses an equivalent database derived from the same migrations with deliberately broader, isolated cleanup authority.

### Workflow neutrality at the orchestration interface

The orchestration interface does not carry or inject:

- BATDD skills;
- Gherkin requirements;
- an orchestration-owned `AGENTS.md`;
- repository instruction rewrites;
- a prescribed test framework;
- a prescribed implementation workflow.

Users describe the workflow they want orchestrated. Target workspaces retain their own instructions, skills, acceptance rules, tools, and terminology. The framework supplies durable coordination, authority, execution, evidence, recovery, and judgment primitives.

### Gherkin BATDD for this repository

Development of the Codex Orchestration Framework repository is governed by Gherkin BATDD.

This is the repository's development and acceptance law, not behavior imposed on orchestrated workspaces. The framework must prove through acceptance tests that target workspaces are not modified merely to adopt the framework's internal methodology.

## User Stories

- As a Founder, I want to describe one campaign across multiple workspaces so that I can coordinate one objective without manually managing every agent task.
- As a Founder, I want each workspace to retain its own workflow and instructions so that orchestration does not rewrite how the repository operates.
- As a Campaign Coordinator, I want to await durable decision events so that I do not consume model context polling repositories.
- As a Project Orchestrator, I want to release only dependency-ready and write-safe work so that parallel agents cannot collide or exceed authority.
- As a Wave Judge Coordinator, I want to await a frozen set of N reducer-approved workspace readiness conditions so that judgment starts only when the complete declared wave is ready.
- As a Worker, I want a precise immutable assignment and scoped interface so that I know what I may change and what evidence I must submit.
- As a Preflight agent, I want an independent verification surface so that deterministic failures are discovered before expensive judgment.
- As an independent Verifier, I want current-disk and live-boundary access without implementation authority so that I can attempt to disprove reported success.
- As a Judge, I want a clean evidence index and narrow verdict interface so that implementation discussion cannot substitute for proof.
- As an operator, I want transport, delivery, product, evidence, and judgment failures classified separately so that the correct recovery path is selected.
- As an operator, I want role-scoped commands so that an agent cannot perform destructive database actions outside its assignment.
- As an operator, I want every surfaced error to preserve its source package and causal chain so that I can distinguish database, delivery, monitor, transport, Codex, process, and interface failures without guessing from prose.
- As a user, I want to express my own workflow so that the framework orchestrates my work without forcing the framework's development methodology onto my repositories.

## V1 Finish Line

V1 is accepted only after one real campaign spans two repositories and demonstrates all of the following:

- one successful implementation lane;
- one meaningful failed-only repair;
- durable dependency and retry enforcement;
- one killed execution pane;
- one missing lifecycle hook;
- one lifecycle hook bound to the exact campaign, workspace, job, attempt, execution, transport incarnation, Codex session, and turn it observed;
- one incomplete Worker completion;
- one incomplete Judge completion;
- one fresh Judge after material implementation change;
- role-scoped database and service authorization;
- rejection of unauthorized destructive database actions;
- service, Docker, and full local-host restart reconciliation;
- durable delivery delay and recovery;
- a multi-campaign or multi-workspace pending monitor;
- one Wave Judge Coordinator suspended until all N declared workspaces reach reducer-approved judgment readiness or an explicit short-circuit condition;
- no prompt-message polling by the Campaign Coordinator;
- compact decision-boundary wake results;
- an all-jobs-terminal state that is not incorrectly accepted;
- independently reproduced acceptance;
- zero leaked processes, panes, worktrees, ports, or database resources;
- deterministic reconstruction of campaign state;
- one generated final closeout backed by durable event, execution, verdict, and artifact identities;
- proof that target repositories were not modified to adopt orchestration-owned BATDD skills, Gherkin, or `AGENTS.md` instructions.

## Success Criteria

The framework succeeds when:

1. Durable campaign state can be reconstructed without reading agent chat or terminal history.
2. No unauthorized role can advance acceptance state.
3. No implementer can independently certify its own work.
4. Delivery retry and semantic repair remain separate.
5. A process or transport failure does not automatically consume a semantic retry.
6. Missed notifications and hooks are recovered by reconciliation.
7. The Coordinator remains dormant until an actionable logical event occurs.
8. Users can describe workspace workflows without adopting orchestration-owned methodology.
9. The orchestration repository's own Gherkin BATDD contract remains fully enforced.
10. Production orchestration roles cannot delete or truncate authoritative process data.
11. Test infrastructure uses equivalent migrations without risking durable development campaigns.
12. Full local-host restart recovery reconstructs durable campaign state and reconciles surviving or missing execution resources.
13. A completed campaign produces reproducible proof rather than relying on agent self-report.
14. Every accepted hook observation is attributable to one registered execution and transport incarnation.
15. Files, completion summaries, terminal text, and hook events cannot satisfy readiness until normalized and reducer-approved.
16. Cross-package errors retain stable source, code, cause, and safe structured context across process, CLI, MCP, Unix-socket, and generated-projection boundaries.

## High-Level Constraints

- The orchestration repository owns its PostgreSQL database, schema contract, bootstrap, and migrations.
- The dormant Hermes database may be inspected as historical read-only input but remains unaffected.
- Development uses a localized Docker-based PostgreSQL installation.
- Development topology supports database-only and full control-plane Compose profiles.
- One installation database supports many portfolios, campaigns, repositories, workspaces, jobs, and executions.
- Development and test databases are separate but derive from identical migrations.
- The delivery engine owns delivery timing, leases, recovery, and delivery retries without becoming acceptance authority.
- Delivery-engine internal storage remains opaque and separately permissioned from durable orchestration state.
- The deterministic reducer alone advances authoritative orchestration state.
- Agents use role-scoped CLI or MCP capabilities rather than unrestricted database credentials.
- Runtime authorization is enforced in depth through assignment identity, service commands, database roles, function grants, table privileges, constraints, and triggers.
- Production runtime roles cannot delete or truncate authoritative orchestration data.
- Database bootstrap is non-destructive; destructive test reset is separate and guarded.
- A persistent control-plane capability supports durable workers, monitoring, hook ingestion, and reconciliation, without predetermining its Nx app name.
- Local IPC may use a Unix socket behind a transport-neutral service contract.
- CLI and MCP surfaces share the same underlying authority contracts.
- Shared types and utilities remain dependency-minimal, runtime-neutral, and free of domain policy so the shared package cannot become an orchestration god-package.
- Every production package emits errors through a common boundary contract with package-attributed codes, preserved causes, safe serialization, and role-appropriate redaction; error classification does not itself authorize retry or acceptance.
- Direct, orchestration-owned tmux is the sole V1 execution transport behind a versioned `TmuxAgentTransport` adapter; dmux is not canonical.
- Global and project-local `.codex/orchestration/manifest.json` files describe desired tmux routing only and never own jobs, retries, evidence, verdicts, or acceptance state.
- cmux and Mercury are not required for V1.
- Codex hooks are idempotent, execution-bound observations with reconciliation fallback; `Stop` means a Codex turn stopped, not that a job completed or passed.
- Hierarchical monitors may aggregate frozen conditions across jobs, waves, workspaces, and campaigns without becoming state-transition authorities.
- The framework does not write orchestration methodology into target workspaces as a condition of participation.

## Testing Decisions

All development of this Nx workspace uses Gherkin BATDD.

The workspace acceptance profile includes:

- meaningful RED before GREEN;
- deterministic control-logic tests;
- real PostgreSQL and durable-delivery boundary tests;
- real IPC, CLI, MCP, direct-tmux, routing-manifest, hook, hierarchical-monitor, process, and cleanup tests where applicable;
- adversarial acceptance scenarios;
- independent Preflight and verification;
- fresh judgment after material repairs;
- resource-delta proof;
- database-permission and destructive-action rejection tests;
- service, Docker, and full local-host restart recovery;
- workflow-neutral target fixtures that receive no orchestration-owned BATDD skills, Gherkin files, or `AGENTS.md` instructions;
- real two-repository dogfood before V1 acceptance.

The framework's internal BATDD harness must not leak into the interface contract being tested.

## Out of Scope for V1

- a web dashboard;
- general-purpose project management;
- arbitrary agent SQL;
- direct database credentials for Workers or Judges;
- multiple production execution transports;
- cmux as a required transport;
- Mercury as a transport runner;
- multi-host scheduling;
- a hosted control plane;
- prescribing BATDD, Gherkin, or another methodology to target workspaces;
- replacing workspace acceptance rules with database claims;
- automatic commits, merges, rebases, or worktree deletion without explicit authority;
- using terminal activity or model-authored status as acceptance.

## Inline Open Items

**OPEN:** Which two repositories will form the first cross-project V1 dogfood?

**OPEN:** What exact workflow descriptions and workspace-local authorities must the first dogfood accept without orchestration-owned methodology injection?

**OPEN:** What exact host resources must be reconciled after full local-host restart when an execution cannot be resumed in place?

**OPEN:** Which product claims, if any, are justified only after repeated dogfood and replication beyond the first two-workspace campaign?

## Lowering Boundary

This PRD deliberately does not:

- choose final domain or package boundaries;
- retain `apps/daemon` as architecture;
- define database tables or migrations;
- select a migration library;
- define CLI commands or MCP tools;
- design the Unix-socket protocol;
- enumerate features;
- sequence implementation phases;
- make a public distribution claim.

Those decisions belong to later lowering, architecture contracts, acceptance charters, and evidence from dogfood.

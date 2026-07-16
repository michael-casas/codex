# Codex Orchestration Framework — Domains

**Status:** Accepted · Layer 2 capability boundaries frozen for feature lowering
**Date:** 2026-07-15
**Input authority:** Accepted `PRD.md`
**Architecture authority:** Agent Wiki `codex/orchestration/SPEC.md` v0.5.0
**Next lowering:** Each accepted domain → `packages/<domain>/src/FEATURES.md`

**Verdict (2026-07-15, Founder):** Use top-level domain packages rather than `packages/domains/`. Use `shared`, `boundary`, `auth`, `process`, `db`, `delivery`, `monitor`, `codex`, `transport`, and `testing`. Keep coordinator roles, CLI, MCP, and persistent service processes as composition surfaces over these domains until later lowering proves that another domain is required.

## Domain Law

- One accepted domain maps to one independently registered Nx project at `packages/<domain>`.
- Domain ownership follows capabilities, not application screens, runtime processes, agents, or transport panes.
- Each domain owns its later feature authority at `packages/<domain>/src/FEATURES.md`.
- No `packages/domains/` aggregation layer may hide dependency edges from `nx affected`.
- Domain dependencies must remain acyclic. A downstream adapter may implement an upstream port; the upstream domain must not import the adapter merely because the adapter persists or transports it.
- CLI, MCP, Unix-socket service, and possible daemon or app entrypoints compose domain capabilities. Their executable shape is not frozen by this document.
- Ground-0 testing work already present in the repository is foundation evidence. It does not redefine product-domain boundaries.
- `shared` MUST remain a dependency-minimal common kernel. It MUST NOT absorb domain policy merely because multiple packages use it.
- `boundary` owns error provenance and serialization across code boundaries. It MUST NOT decide delivery retry, semantic repair, verdicts, or acceptance.

## 1. Shared

**Package:** `packages/shared`

**Owner:** Runtime-neutral shared kernel

**Boundary:** Repeated, domain-neutral type or utility need → one stable reusable primitive without importing orchestration policy or infrastructure.

**Dependencies:** None.

Capabilities:

- runtime-neutral shared types and branded scalar helpers;
- deterministic serialization and digest utilities;
- clock, time, duration, and deadline primitives;
- result, option, assertion, and exhaustive-match utilities that do not encode domain policy;
- schema and validation composition helpers;
- redaction and safe diagnostic-value utilities;
- explicit public exports and dependency-purity constraints.

**Does not own:** Campaign identities, role policy, error meaning, database adapters, transport behavior, orchestration state, or a miscellaneous dumping ground.

**Feature authority after lowering:** `packages/shared/src/FEATURES.md`

---

## 2. Boundary

**Package:** `packages/boundary`

**Owner:** Cross-package error provenance and safe failure representation

**Boundary:** Unknown or package-local failure → one source-attributed, causally linked, safely serializable boundary error.

**Dependencies:** `shared` only. Boundary contracts MUST NOT import production domains, allowing every domain package to depend on `boundary` without cycles.

Capabilities:

- stable package-source and error-code namespaces;
- a common boundary-error class and causal-chain contract;
- structured safe context and correlation identity;
- fault class, severity, retryability hint, and operator-action metadata without owning policy decisions;
- unknown-error normalization;
- serialization and deserialization across process, CLI, MCP, Unix-socket, hook, and generated-projection boundaries;
- public, operator, and internal redaction views;
- preservation of originating package provenance across wrapping and rethrowing;
- aggregate and multi-cause failure representation.

**Does not own:** Logging transport, retry authorization, semantic repair, acceptance, domain-specific error catalogs, or domain behavior.

**Feature authority after lowering:** `packages/boundary/src/FEATURES.md`

---

## 3. Auth

**Package:** `packages/auth`

**Owner:** Authority and security policy

**Boundary:** Actor, role, assignment, execution, and capability identity → a deterministic authorization decision for one scoped orchestration operation.

**Dependencies:** `shared` for neutral primitives and `boundary` for source-attributed failures. Auth policy must not depend on persistence, transport, delivery, or a particular interface.

Capabilities:

- role and actor identity vocabulary;
- assignment- and execution-scoped capability grants;
- command and resource authorization decisions;
- short-lived execution credential contracts;
- capability revocation and expiry semantics;
- denial reasons suitable for durable evidence;
- separation of Worker, Preflight, Verifier, Judge, Coordinator, governor, transport, monitor, and operator authority.

**Does not own:** PostgreSQL roles or grants, database credential storage, CLI parsing, transport isolation, reducer transitions, or verdict meaning.

**Feature authority after lowering:** `packages/auth/src/FEATURES.md`

---

## 4. Process

**Package:** `packages/process`

**Owner:** Durable orchestration semantics

**Boundary:** Authorized campaign facts and claims → deterministic state transitions, projections, readiness conditions, and terminal classifications.

**Dependencies:** `shared`, `boundary`, and `auth` for neutral primitives, error provenance, role, and capability meaning.

Capabilities:

- campaign, workspace, DAG job, dependency, attempt, execution, event, artifact, evidence, verdict, and monitor-subscription vocabulary;
- immutable assignment and campaign-definition contracts;
- event envelopes, causation, sequencing, and idempotency rules;
- deterministic reducer and replay;
- dependency readiness and write-lease legality;
- failed-only repair, retry-budget, locked-green, and stop-boundary policy;
- evidence and verdict validation contracts;
- campaign, workspace, wave, and portfolio projections;
- reducer-approved logical conditions such as preflight passed, wave judgment ready, judgment terminal, blocked, and accepted.

**Does not own:** Physical PostgreSQL storage, pg-boss delivery timing, tmux processes, Codex hooks, monitor suspension mechanics, or interface presentation.

**Feature authority after lowering:** `packages/process/src/FEATURES.md`

---

## 5. DB

**Package:** `packages/db`

**Owner:** PostgreSQL persistence and database-enforced authority

**Boundary:** Stable domain contracts → local PostgreSQL schemas, migrations, repositories, roles, grants, constraints, and transactional persistence.

**Dependencies:** `shared`, `boundary`, `auth`, and `process` contracts. Dependency inversion is mandatory: `process` defines durable meaning; `db` implements persistence without making `process` import PostgreSQL adapters.

Capabilities:

- localized Docker PostgreSQL development topology;
- canonical non-destructive bootstrap and migrations;
- production and test database parity from the same migrations;
- process-schema persistence adapters;
- role, grant, function, constraint, trigger, and row-level enforcement where selected;
- production bans on unauthorized `DELETE` and `TRUNCATE` over authoritative schemas;
- isolated and guarded test-reset authority;
- pg-boss storage isolation from product-owned process tables;
- transactional outbox, sequence, and reconciliation persistence;
- read-only historical inspection boundaries for external databases such as Hermes.

**Does not own:** Reducer legality, semantic retry, queue scheduling, monitor predicates, transport state, or acceptance decisions.

**Feature authority after lowering:** `packages/db/src/FEATURES.md`

---

## 6. Delivery

**Package:** `packages/delivery`

**Owner:** Durable work delivery and recovery mechanics

**Boundary:** Reducer-authorized delivery request → leased, delayed, retried, recovered, or terminal delivery attempt through pg-boss.

**Dependencies:** `shared` and `boundary` for neutral primitives and error provenance, `process` for legal delivery envelopes, and `db` for the pg-boss bridge and durable associations.

Capabilities:

- pg-boss queue and policy contracts;
- delayed availability and scheduling;
- claims, leases, heartbeats, recovery, reaping, and dead-letter behavior;
- delivery-attempt identity and association with process executions;
- provider and transport interruption classification;
- transactional release after reducer authorization;
- at-least-once delivery with idempotent consumers;
- separation of delivery retry from semantic repair and judgment retry.

**Does not own:** DAG legality, evidence sufficiency, semantic retry authorization, runtime launch, or acceptance.

**Feature authority after lowering:** `packages/delivery/src/FEATURES.md`

---

## 7. Monitor

**Package:** `packages/monitor`

**Owner:** Suspension, logical-condition observation, and compact wake delivery

**Boundary:** A schema-valid declarative wait over durable process state → one compact, attributed continuation result at a reducer-approved decision boundary.

**Dependencies:** `shared` and `boundary` for neutral primitives and error provenance, `process` for registered logical conditions and projections, and `db` for durable subscriptions, cursors, listeners, and reconciliation.

Capabilities:

- durable monitor subscriptions and cursors;
- registered, schema-validated predicates without arbitrary executable conditions;
- `any` and frozen-membership `all` aggregation;
- hierarchical waits across jobs, waves, workspaces, campaigns, and portfolios;
- explicit blocked, cancelled, failed, and retry-exhausted short circuits;
- notification multiplexing and missed-notification reconciliation;
- event-noise coalescing into compact projections;
- active pending-tool waits and distinct dormant-wake adapter contracts;
- timeout, cancellation, reattachment, and cleanup;
- normalization requirements for file observations and completion-summary artifacts before they may influence readiness.

**Does not own:** State transitions, polling prompts, host-specific task injection, file truth, verdict interpretation, or acceptance.

**Feature authority after lowering:** `packages/monitor/src/FEATURES.md`

---

## 8. Codex

**Package:** `packages/codex`

**Owner:** Codex runtime identity and lifecycle integration

**Boundary:** Explicit Codex launch and hook inputs → normalized, redacted, execution-bound runtime observations.

**Dependencies:** `shared` and `boundary` for neutral primitives and error provenance, `auth` for scoped hook authority, and `process` for event identity and ingestion contracts.

Capabilities:

- explicit model, reasoning, permission, profile, working-directory, and hook-profile contracts;
- standardized `CodexHookBridge` configuration;
- `SessionStart`, `UserPromptSubmit`, `SubagentStart`, `PostToolUse`, `SubagentStop`, and `Stop` normalization;
- Codex session, turn, subagent, model, permission, and working-directory identity;
- cross-checking hook stdin against orchestration pane environment;
- hook idempotency, trust, version, redaction, bounded timeout, and local spool contracts;
- distinction between turn stop, process exit, worker readiness, and acceptance;
- Codex resume and transport-incarnation reconciliation inputs.

**Does not own:** tmux panes, Git worktrees, assignment legality, raw prompt retention by default, process transitions, or verdicts.

**Feature authority after lowering:** `packages/codex/src/FEATURES.md`

---

## 9. Transport

**Package:** `packages/transport`

**Owner:** Physical agent execution, routing, isolation, and cleanup

**Boundary:** Reducer-authorized assignment plus schema-valid routing target → one attributable Codex execution in an orchestration-owned tmux and worktree boundary.

**Dependencies:** `shared` and `boundary` for neutral primitives and error provenance, `auth` for scoped execution authority, `process` for assignment and execution identity, and `codex` for launch and hook-profile contracts.

Capabilities:

- versioned `AgentTransport` and `TmuxAgentTransport` contracts;
- explicit tmux socket, server epoch, session, window, pane, PID, TTY, and process-group identity;
- global and project-local `.codex/orchestration/manifest.json` routing contracts;
- atomic manifest validation, versioning, digest binding, and target resolution;
- isolated Git worktree creation from the exact authorized base revision;
- execution-scoped pane environment and scoped credential delivery;
- loss-detectable prompt delivery and assignment-digest acknowledgment;
- inspection, bounded capture, signal, cancellation, descendant cleanup, and endpoint closure;
- restart reconciliation without silent duplicate execution;
- preservation of human-owned tmux sessions and worktrees;
- exclusion of automatic commits, merges, rebases, and destructive cleanup from transport authority.

**Does not own:** Jobs, queue timing, retries, evidence sufficiency, monitor conditions, judgment, or acceptance. Routing manifests are not process stores.

**Feature authority after lowering:** `packages/transport/src/FEATURES.md`

---

## 10. Testing

**Package:** `packages/testing`

**Owner:** Repository-local BATDD harness and orchestration acceptance infrastructure

**Boundary:** Declared repository acceptance profile → ordered, nonzero, fidelity-preserving L1, L2, and L3 evidence plus cleanup and resource-delta proof.

**Dependencies:** May exercise every accepted domain through public contracts and real boundaries. Production domains MUST NOT depend on `testing`.

Capabilities:

- Ground-0 L1, L2, and L3 classification and ordered aggregation;
- Nx-native affected selection and machine-readable evidence;
- real PostgreSQL, pg-boss, IPC, tmux, Codex hook, monitor, restart, and cleanup fixtures;
- false-green and zero-selected-test rejection;
- workflow-neutral target-repository fixtures;
- database-permission and destructive-action rejection fixtures;
- process, pane, worktree, port, credential, hook-spool, and database resource inventories;
- multi-workspace dogfood and recovery harnesses;
- generated closeout equivalence and artifact-digest validation.

**Does not own:** Product runtime authority, target-repository methodology, acceptance transitions, or a general orchestration domain.

**Feature authority after lowering:** `packages/testing/src/FEATURES.md`

---

## Composition Surfaces, Not Domains

The following are intentionally deferred composition decisions:

- Campaign Coordinator host integration;
- Project Orchestrator process entrypoint;
- Wave Judge Coordinator process entrypoint;
- scoped orchestration CLI executable;
- MCP server and monitor tool exposure;
- Unix-socket service host;
- persistent worker or daemon process;
- generated human status and closeout views.

These surfaces may become Nx applications or thin adapter packages after feature lowering. They MUST compose the accepted domain contracts and MUST NOT become a broad `packages/orchestration` god-domain.

## Dependency Direction

```text
shared
  └── boundary
       ├── auth
       │    └── process
       │         ├── db
       │         │    ├── delivery
       │         │    └── monitor
       │         ├── codex
       │         │    └── transport
       │         └── transport
       └── every production domain for error provenance

testing ──> all public domain contracts and real boundaries
```

Interpretation:

- `shared` provides neutral primitives and must not import another production domain.
- `boundary` depends only on `shared` and provides error provenance to every production domain.
- `auth` and `process` define foundational policy and semantic contracts.
- `db` implements persistence for upstream contracts; upstream domains do not import concrete PostgreSQL adapters.
- `delivery` and `monitor` consume durable process projections without gaining reducer authority.
- `codex` normalizes Codex-specific lifecycle facts without owning tmux.
- `transport` consumes assignment and Codex launch contracts without owning durable process state.
- `testing` is downstream-only.

## Cross-Cutting Laws

These concerns apply across domains but do not form additional domains:

| Concern                | Application                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Stable identity        | Campaign, workspace, job, attempt, execution, transport, session, turn, artifact, and verdict boundaries                              |
| Error provenance       | `boundary` preserves source package, stable code, causal chain, safe context, and redacted views without deciding retry or acceptance |
| Idempotency            | Delivery, hooks, events, monitor wakes, reconciliation, and verdict submission                                                        |
| Least privilege        | CLI commands, database roles, transport credentials, write surfaces, and Judge authority                                              |
| Evidence provenance    | Commands, validators, artifacts, digests, cleanup, and generated projections                                                          |
| BATDD                  | Development and acceptance of this repository only; never injected into target repositories                                           |
| Nx affected discipline | One project per domain with explicit dependency edges; test only changed and transitively affected projects                           |
| Reconciliation         | Database, delivery, monitor, tmux, Codex hook, process, worktree, and resource state                                                  |

## Layer Boundary

This document freezes capability ownership and dependency direction. It deliberately does not:

- enumerate atomic features;
- assign feature IDs;
- create or scaffold packages;
- choose application entrypoints;
- define tables, CLI commands, JSON schemas, or tmux command syntax;
- sequence implementation phases;
- compile a DAG.

The next layer must read this file and write distributed feature authority to `packages/<domain>/src/FEATURES.md`. It may not move a capability between domains without a new Founder verdict amending this layer.

# Process — Features

**Status:** Accepted
**Domain authority:** [DOMAINS.md — Process](../../../DOMAINS.md#4-process)
**Package:** `packages/process`
**Boundary:** Authorized campaign facts and claims → deterministic state transitions, projections, readiness conditions, and terminal classifications.

## Core Features

| ID       | Feature                                         | Outcome                                                                                                                                                                  | Depends on                             |
| -------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| PROC-001 | Orchestration identity and campaign definitions | Campaigns, workspaces, waves, jobs, attempts, executions, artifacts, verdicts, and subscriptions have stable identities inside validated immutable campaign definitions. | SHR-001, AUTH-001                      |
| PROC-002 | DAG and dependency validation                   | Campaign job graphs reject cycles, missing dependencies, illegal role edges, and conflicting write surfaces before work becomes ready.                                   | PROC-001, AUTH-002                     |
| PROC-003 | Immutable assignment and attempt envelopes      | Each authorized attempt freezes role, scope, base revision, write lease, acceptance hashes, evidence requirements, retry budget, and stop boundary.                      | PROC-001, PROC-002, AUTH-003           |
| PROC-004 | Event causality and idempotent ingestion        | Claims and observations enter an append-only, totally ordered event contract with stable causation and conflicting-duplicate rejection.                                  | PROC-001, PROC-003, SHR-002, BND-005   |
| PROC-005 | Deterministic reducer and replay                | The same valid ordered events reproduce the same authoritative campaign state without model judgment.                                                                    | PROC-002, PROC-004                     |
| PROC-006 | Admission, capacity, and write leases           | Only dependency-ready work with available capacity and a non-conflicting authorized write lease may be released.                                                         | PROC-003, PROC-005, AUTH-005           |
| PROC-007 | Artifact and evidence validation                | Immutable artifacts, validator results, cleanup proof, and digests are registered and checked before readiness can advance.                                              | PROC-003, PROC-004, SHR-002            |
| PROC-008 | Verdict and independence validation             | Preflight, verifier, and Judge submissions advance only when schema, assignment, evidence set, role, freshness, and independence rules pass.                             | PROC-003, PROC-007, AUTH-005           |
| PROC-009 | Failed-only repair and locked greens            | Repair attempts preserve accepted units, name failed scope, consume the correct semantic budget, and reject unauthorized acceptance changes.                             | PROC-005, PROC-007, PROC-008           |
| PROC-010 | Logical readiness and terminal projections      | Reducer-approved projections distinguish preflight pass, wave readiness, judgment terminal, all-jobs-terminal, accepted, blocked, failed, and cancelled states.          | PROC-005, PROC-007, PROC-008, PROC-009 |

## Optional Features

None. These semantics form the accepted durable control plane.

## Cross-Domain Dependencies

- `shared:SHR-001` — stable orchestration scalar types.
- `shared:SHR-002` — artifact, contract, and replay digests.
- `boundary:BND-005` — failures retain provenance across reducer and projection seams.
- `auth:AUTH-001` — authoritative actor and role identities.
- `auth:AUTH-003` — attempts bind to exact execution authority.
- `auth:AUTH-005` — transition requests are role-scoped.

## Layer Boundary

This file defines durable orchestration meaning. It does not choose database tables, pg-boss queues, tmux commands, Codex hook scripts, application entrypoints, or implementation sequencing.

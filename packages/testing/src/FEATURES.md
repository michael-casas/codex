# Testing — Features

**Status:** Accepted
**Domain authority:** [DOMAINS.md — Testing](../../../DOMAINS.md#10-testing)
**Package:** `packages/testing`
**Nested physical authority:** [Ground-0 feature contract](./ground-zero/FEATURE.md)
**Boundary:** Repository acceptance contract → independent, fidelity-ordered L1/L2/L3 evidence selected through Nx and real boundary fixtures.

## Core Features

| ID      | Feature                                                 | Outcome                                                                                                                                                                            | Depends on                                                      |
| ------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| TST-001 | Ground-0 layer classification                           | Unit and in-process integration belong to ordered L1; real-boundary integration and end-to-end tests belong to ordered L2; declarative product behavior belongs to L3.             | SHR-001                                                         |
| TST-002 | Ordered L1/L2/L3 aggregate and evidence                 | One Nx entrypoint emits exact layer headings, preserves child status, counts selected tests, and writes machine-readable evidence for the same uncached execution.                 | TST-001, SHR-004                                                |
| TST-003 | Nx-affected staged-file normalization                   | Added, modified, deleted, and renamed staged paths select changed projects plus transitive dependents once while excluding unrelated projects.                                     | TST-002                                                         |
| TST-004 | False-green and nonzero-collector rejection             | Required collectors cannot pass on zero selected tests, cached live evidence, assertion-free bindings, invalid async steps, no-op fixtures, or runner-of-runners shortcuts.        | TST-002                                                         |
| TST-005 | Real PostgreSQL and delivery fixtures                   | L2 proves migrations, roles, destructive-action bans, pg-boss delivery, retries, recovery, and cleanup against disposable real infrastructure.                                     | DB-003, DB-005, DB-006, DEL-004                                 |
| TST-006 | Real tmux and Codex-hook fixtures                       | L2 proves exact launch, prompt delivery, pane identity, hook attribution, restart reconciliation, descendant cleanup, and absence of generated runtime files in product diffs.     | TX-007, TX-009, TX-010, CDX-006, CDX-008                        |
| TST-007 | Monitor, authorization, and destructive-action fixtures | L2 proves missed-notification recovery, scoped role denials, and production/test destructive-action differences at their real boundaries.                                          | MON-003, AUTH-005, DB-005                                       |
| TST-008 | Restart, reconciliation, and resource-delta closure     | Selected acceptance proves durable recovery and returns database, queue, tmux, process, worktree, file, and credential resources to the declared baseline.                         | DB-008, MON-008, TX-010                                         |
| TST-009 | Workflow-neutral target fixtures                        | Fixtures prove that orchestration transports arbitrary declared user workflows without prescribing BATDD skills, AGENTS.md content, or architecture to the orchestrated workspace. | TX-001, TX-003                                                  |
| TST-010 | Two-workspace dogfood and closeout equivalence          | L3 exercises at least two distinct workspaces through real orchestration, and generated closeout projections agree with immutable evidence and independent verdict state.          | TST-005, TST-006, TST-007, TST-008, TST-009, PROC-007, PROC-008 |

## Optional Features

None. Repository profiles may declare a layer or runtime N/A only when the corresponding product surface is absent and the aggregate records that decision explicitly.

## Cross-Domain Dependencies

- `shared` and `boundary` — fixtures use public contracts and assert source-preserving failures.
- `auth` — tests prove both grants and denials through scoped clients.
- `process` — immutable evidence and independent verdict state ground closeout.
- `db` and `delivery` — real PostgreSQL and pg-boss boundaries remain test-owned infrastructure.
- `monitor` — waits are proven against races, restart, timeout, and cleanup.
- `codex` and `transport` — launches, hooks, tmux identity, worktrees, and descendants are exercised physically.

## Layer Boundary

This file defines the domain acceptance catalog above the existing Ground-0 physical contract. It does not move L1 or L2 execution into Cucumber, make every implementation detail an L3 scenario, authorize implementer self-certification, or replace repository-specific acceptance profiles.

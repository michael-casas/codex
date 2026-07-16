# Transport — Features

**Status:** Accepted
**Domain authority:** [DOMAINS.md — Transport](../../../DOMAINS.md#9-transport)
**Package:** `packages/transport`
**Boundary:** Authorized execution and routing declaration → isolated tmux/worktree/Codex resources with provable delivery, identity, observation, cancellation, and reconciliation.

## Core Features

| ID     | Feature                                                | Outcome                                                                                                                                                                                | Depends on                                       |
| ------ | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| TX-001 | Portable AgentTransport contract                       | Orchestration depends on a versioned typed transport boundary whose capabilities and errors do not expose tmux command details to process policy.                                      | AUTH-005, PROC-003, CDX-001                      |
| TX-002 | Direct tmux adapter and physical identity              | A tmux execution is identified by socket, server epoch, session, window, pane, PID, TTY, and process group so reuse cannot masquerade as continuity.                                   | TX-001, PROC-001                                 |
| TX-003 | Global and project manifest routing                    | Versioned global and project-local manifests validate and atomically activate deterministic model, role, prompt, and target resolution by content digest.                              | TX-001, SHR-002, SHR-004                         |
| TX-004 | Isolated worktree and write lease                      | Each implementation lane receives the authorized base revision, isolated worktree, and bounded write lease unless the assignment explicitly serializes a shared surface.               | TX-001, PROC-006                                 |
| TX-005 | Pane environment and scoped credentials                | The created pane receives exact execution identity and only the short-lived role-scoped credentials required by its client operations.                                                 | TX-002, AUTH-004, CDX-002                        |
| TX-006 | Exact Codex launch                                     | Transport launches the declared Codex runtime profile exactly, including model, reasoning, permissions, hooks, directory, and assignment envelope.                                     | TX-005, CDX-001                                  |
| TX-007 | Prompt delivery and assignment acknowledgement         | Prompt bytes are delivered to the intended live pane and acknowledged against the immutable assignment digest before work is considered dispatched.                                    | TX-006, PROC-003, SHR-002                        |
| TX-008 | Advisory inspection and capture                        | Typed inspection can report pane/process identity and bounded output for operators while remaining non-authoritative for readiness or completion.                                      | TX-002                                           |
| TX-009 | Signal, cancellation, and descendant cleanup           | Authorized cancellation targets the exact process group, terminates descendants within policy, and records cleanup outcome without killing unrelated human resources.                  | TX-002, PROC-010                                 |
| TX-010 | Restart reconciliation and human-resource preservation | On restart, transport reconciles manifest, database, worktree, tmux, and process identity; it adopts, quarantines, or reports resources without assuming ownership of unrelated panes. | TX-002, TX-003, TX-004, TX-008, TX-009, PROC-010 |
| TX-011 | Runtime-state hygiene and reducer-gated integration    | Generated hooks, prompts, manifests, tmux state, and worktree metadata remain externalized or ignored, and merge/cleanup actions require reducer-authorized commands.                  | TX-003, TX-004, TX-005, TX-009, AUTH-005         |

## Optional Features

None. A second tmux runner, dmux automation, cmux dependency, and transport-owned process policy are outside V1.

## Cross-Domain Dependencies

- `shared` — manifests, assignment digests, validation, and typed transport envelopes.
- `boundary` — provider, shell, worktree, pane, and process failures retain their originating package and source.
- `auth:AUTH-004` — pane credentials are short-lived and revocable.
- `auth:AUTH-005` — every transport mutation is capability-scoped.
- `process:PROC-003` — delivery acknowledges one immutable assignment.
- `process:PROC-006` — capacity and write leases are process policy, not tmux policy.
- `process:PROC-010` — cleanup and integration commands require reducer-approved state.
- `codex:CDX-001` — Codex launch parameters are explicit and versioned.
- `codex:CDX-002` — the pane environment binds hooks to the physical execution.

## Layer Boundary

This file defines the physical agent transport. It does not own durable jobs, retries, acceptance, Judge decisions, model classification policy, or an interactive TUI. `manifest.json` is routing configuration, not a PostgreSQL process ledger.

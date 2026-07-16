# Codex — Features

**Status:** Accepted
**Domain authority:** [DOMAINS.md — Codex](../../../DOMAINS.md#8-codex)
**Package:** `packages/codex`
**Boundary:** Explicit Codex execution identity and lifecycle observations → attributed, redacted process events and recoverable hook delivery.

## Core Features

| ID      | Feature                                                | Outcome                                                                                                                                                              | Depends on                                    |
| ------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| CDX-001 | Explicit runtime launch profile                        | Every Codex launch declares model, reasoning level, permission mode, working directory, hooks, and trust policy rather than inheriting ambient convenience defaults. | AUTH-005, SHR-001                             |
| CDX-002 | Pane environment and hook-stdin identity binding       | Hook invocations resolve the exact campaign, assignment, attempt, execution, actor, and physical pane identity from scoped environment plus supported hook input.    | CDX-001, PROC-003, AUTH-003                   |
| CDX-003 | SessionStart and resume normalization                  | New, resumed, and compacted Codex sessions produce stable lifecycle observations associated with the same authorized execution or an explicit successor.             | CDX-002, PROC-004                             |
| CDX-004 | Prompt metadata redaction and digesting                | Prompt identity can be proven by deterministic metadata and digests without storing raw sensitive prompt or tool payloads.                                           | CDX-002, SHR-002, SHR-005                     |
| CDX-005 | Subagent and Stop lifecycle semantics                  | Subagent observations and Stop hooks are attributed to their exact execution; Stop means a model turn stopped, never that work was accepted or the process ended.    | CDX-002, CDX-003, PROC-004                    |
| CDX-006 | Hook trust, versioning, and idempotency                | Only supported, versioned hook envelopes are admitted, and duplicate delivery cannot create duplicate authoritative effects.                                         | CDX-002, PROC-004, SHR-002                    |
| CDX-007 | Bounded hook delivery and local spool                  | Hook emission is time-bounded and can durably spool an attributed envelope for later reconciliation when the scoped client is unavailable.                           | CDX-006, SHR-003, BND-005                     |
| CDX-008 | Identity-mismatch quarantine and resume reconciliation | Stale, mismatched, or ambiguous session observations are quarantined and reconciled without being credited to another execution.                                     | CDX-003, CDX-005, CDX-006, PROC-010, AUTH-005 |

## Optional Features

| ID      | Feature                   | Outcome                                                                                                                                                                  | Depends on       |
| ------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| CDX-101 | PostToolUse observability | Supported PostToolUse hooks may emit redacted diagnostic observations when a repository profile selects them; they never establish evidence or acceptance by themselves. | CDX-004, CDX-006 |

## Cross-Domain Dependencies

- `shared` — stable runtime envelopes, digests, deadlines, and redaction primitives.
- `boundary:BND-005` — spooled hook failures cross process boundaries without losing provenance.
- `auth:AUTH-003` — hook identity remains bound to the authorized assignment and execution.
- `auth:AUTH-005` — launches and hook clients receive only scoped authority.
- `process:PROC-003` — immutable assignment identity grounds every Codex session.
- `process:PROC-004` — lifecycle observations enter as idempotent causally ordered events.
- `process:PROC-010` — runtime observations cannot outrank reducer-approved state.

## Layer Boundary

This file defines Codex launch and lifecycle integration. It does not own tmux resources, determine worktree routing, store raw prompts, grant database credentials, or treat hooks as acceptance, retry, or final process authority.

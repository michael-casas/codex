# Monitor — Features

**Status:** Accepted
**Domain authority:** [DOMAINS.md — Monitor](../../../DOMAINS.md#7-monitor)
**Package:** `packages/monitor`
**Boundary:** Durable reducer-approved state → bounded, resumable logical wait outcomes for one or many orchestration scopes.

## Core Features

| ID      | Feature                                          | Outcome                                                                                                                                                              | Depends on                       |
| ------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| MON-001 | Wait and condition contracts                     | Callers register schema-valid declarative conditions and receive typed outcomes without embedding polling logic or acceptance authority.                             | PROC-001, PROC-010, SHR-004      |
| MON-002 | Durable subscriptions and cursors                | Exact scopes, frozen membership, and progress cursors survive monitor or coordinator restart without losing or duplicating logical completion.                       | MON-001, DB-004                  |
| MON-003 | Query-arm-requery reconciliation                 | The monitor queries before arming, listens, requeries after arming, and periodically reconciles so notification races and missed notifications cannot strand a wait. | MON-001, MON-002, DB-007, DB-008 |
| MON-004 | Any/all aggregation and terminal short-circuits  | Frozen condition sets resolve deterministic `any` or `all` outcomes and short-circuit on authorized blocked, cancelled, failed, or exhausted states.                 | MON-001, MON-002, PROC-010       |
| MON-005 | Compact logical projections                      | Noisy physical observations coalesce into one actionable, typed logical result rather than waking a coordinator for every event.                                     | MON-004, PROC-010                |
| MON-006 | Hierarchical waits                               | Project Orchestrators, Wave Judge Coordinators, and Campaign Coordinators can await reducer-approved conditions across jobs, waves, workspaces, and campaigns.       | MON-004, MON-005                 |
| MON-007 | Active pending-tool wait                         | A supported monitor call can remain pending and return in the same agent turn when its durable condition resolves, without model-driven polling.                     | MON-002, MON-003, MON-006        |
| MON-008 | Timeout, cancellation, reattachment, and cleanup | Wait ownership can expire, cancel, reattach, and release resources deterministically with attributed terminal outcomes.                                              | MON-002, MON-007, SHR-003        |
| MON-009 | File and artifact normalization                  | A raw path, summary, hook claim, or terminal message cannot satisfy a wait until the evidence is registered and reducer-approved under the expected identity.        | MON-001, PROC-007, PROC-010      |

## Optional Features

| ID      | Feature                    | Outcome                                                                                                                                | Depends on       |
| ------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| MON-101 | Dormant-task wake adapters | A supported external wake surface can reawaken a dormant coordinator from the same durable result used by an active pending-tool wait. | MON-006, MON-008 |

## Cross-Domain Dependencies

- `shared:SHR-003` — deadlines and bounded waits use common time semantics.
- `shared:SHR-004` — condition composition uses neutral result and validation contracts.
- `boundary` — monitor failures retain source provenance without deciding retry or acceptance.
- `process:PROC-007` — registered evidence, not raw filesystem presence, grounds artifact waits.
- `process:PROC-010` — reducer-approved projections are the only completion source.
- `db:DB-004` — subscriptions and cursors persist durably.
- `db:DB-007` — ordered state and notification release support race-safe arming.
- `db:DB-008` — reconciliation repairs missed notification and restart gaps.

## Layer Boundary

This file defines logical waiting and resumption. It does not grant arbitrary SQL, execute user code, infer acceptance from terminal activity, own retry policy, or prescribe the concrete CLI, MCP, daemon, or hook adapter.

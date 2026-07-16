# Delivery — Features

**Status:** Accepted
**Domain authority:** [DOMAINS.md — Delivery](../../../DOMAINS.md#6-delivery)
**Package:** `packages/delivery`
**Boundary:** Reducer-authorized delivery request → leased, delayed, retried, recovered, or terminal delivery attempt through pg-boss.

## Core Features

| ID      | Feature                                          | Outcome                                                                                                                          | Depends on                           |
| ------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| DEL-001 | pg-boss policy and transactional release         | Only reducer-authorized work is committed to a declared pg-boss policy after the corresponding process transaction succeeds.     | PROC-003, PROC-005, DB-006, DB-007   |
| DEL-002 | Delayed and scheduled delivery                   | Work becomes claimable at its durable availability boundary without prompt polling or dependence on a transient notification.    | DEL-001, SHR-003                     |
| DEL-003 | Claims, leases, and heartbeats                   | One delivery attempt owns a bounded lease whose renewal and expiry are attributable and recoverable.                             | DEL-001, DEL-002, SHR-003            |
| DEL-004 | Crash recovery, reaping, and dead-lettering      | Abandoned or exhausted delivery attempts are reclaimed or terminally isolated without silently duplicating accepted execution.   | DEL-003, DB-008                      |
| DEL-005 | Execution association and idempotent consumption | Every physical delivery maps to one process attempt/execution and duplicate delivery produces no duplicate authoritative effect. | DEL-001, DEL-003, PROC-003, PROC-004 |
| DEL-006 | Attributed delivery-failure classification       | Provider, lease, queue, consumer, transport, and product failures remain distinguishable with source-preserving boundary errors. | DEL-004, DEL-005, BND-003, BND-007   |
| DEL-007 | Delivery-versus-semantic-retry separation        | Operational redelivery never consumes or authorizes failed-only repair, verifier retry, or Judge retry.                          | DEL-004, DEL-006, PROC-009           |

## Optional Features

None. Multi-host scheduling remains outside V1.

## Cross-Domain Dependencies

- `shared:SHR-003` — availability, lease, heartbeat, and retry timing.
- `boundary:BND-003` — delivery failures expose fault metadata without deciding policy.
- `boundary:BND-007` — wrapped provider and consumer causes retain provenance.
- `process:PROC-003` — every delivery carries one immutable assignment attempt.
- `process:PROC-009` — semantic retry authority remains outside delivery.
- `db:DB-006` — pg-boss internals and process associations remain isolated.
- `db:DB-007` — authorized release is transactional.
- `db:DB-008` — restart recovery retains durable delivery state.

## Layer Boundary

This file defines delivery mechanics. It does not choose queue names, retry durations, worker processes, transport launches, semantic repair scope, or implementation phases.

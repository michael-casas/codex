# DB — Features

**Status:** Accepted
**Domain authority:** [DOMAINS.md — DB](../../../DOMAINS.md#5-db)
**Package:** `packages/db`
**Boundary:** Stable domain contracts → local PostgreSQL schemas, migrations, repositories, roles, grants, constraints, and transactional persistence.

## Core Features

| ID     | Feature                                            | Outcome                                                                                                                                                             | Depends on                           |
| ------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| DB-001 | Local PostgreSQL development topology              | One Docker-based local database topology supports development, isolated testing, health checks, and restartable orchestration data.                                 | SHR-003, BND-001                     |
| DB-002 | Non-destructive bootstrap and migrations           | Canonical bootstrap and ordered migrations create or upgrade schemas idempotently without deleting authoritative development data.                                  | DB-001, PROC-001                     |
| DB-003 | Production/test migration parity and guarded reset | Development and test databases derive from identical migrations while destructive reset remains isolated, explicit, and test-only.                                  | DB-002, AUTH-005                     |
| DB-004 | Process persistence adapters                       | Campaign, DAG, execution, event, artifact, verdict, projection, and monitor-subscription contracts persist transactionally behind process-owned ports.              | DB-002, PROC-001, PROC-004, PROC-005 |
| DB-005 | Database-enforced least privilege                  | Roles, grants, functions, constraints, and selected row policies enforce scoped operations and ban unauthorized `DELETE` and `TRUNCATE` over authoritative schemas. | DB-002, AUTH-005, AUTH-006           |
| DB-006 | pg-boss storage isolation and execution bridge     | pg-boss internals remain opaque and separately permissioned while stable associations connect delivery jobs to process attempts and executions.                     | DB-002, DB-005, PROC-003             |
| DB-007 | Transactional outbox and deterministic sequencing  | State changes and external notifications commit together with monotonic ordering suitable for replay and loss-tolerant wake delivery.                               | DB-004, PROC-004, SHR-002            |
| DB-008 | Reconciliation persistence                         | Durable cursors, leases, discrepancies, and reconciliation results survive service, Docker, and host restarts.                                                      | DB-004, DB-007, PROC-010             |

## Optional Features

| ID     | Feature                                | Outcome                                                                                                                                              | Depends on      |
| ------ | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| DB-101 | Read-only external database inspection | Explicitly configured historical databases such as Hermes can inform analysis without accepting writes or coupling their lifecycle to orchestration. | DB-005, BND-006 |

## Cross-Domain Dependencies

- `shared:SHR-002` — deterministic digests and ordered persistence payloads.
- `shared:SHR-003` — migration, lease, and restart timing.
- `boundary:BND-001` — DB errors identify their source package.
- `boundary:BND-005` — persistence failures serialize without losing causes.
- `auth:AUTH-005` — database operations are role-scoped.
- `process:PROC-001` — persisted identities retain process meaning.
- `process:PROC-004` — event ordering and idempotency remain process-owned.
- `process:PROC-010` — persisted projections use reducer-approved classifications.

## Layer Boundary

This file defines persistence capabilities. It does not select table names, a migration library, SQL implementation, queue names, roadmap phases, or acceptance transitions.

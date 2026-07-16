# Auth — Features

**Status:** Accepted
**Domain authority:** [DOMAINS.md — Auth](../../../DOMAINS.md#3-auth)
**Package:** `packages/auth`
**Boundary:** Actor, role, assignment, execution, and capability identity → a deterministic authorization decision for one scoped orchestration operation.

## Core Features

| ID       | Feature                          | Outcome                                                                                                                                          | Depends on                          |
| -------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| AUTH-001 | Actor and role identity          | Every human, agent, software role, and transport witness has one stable authority identity independent of model tier.                            | SHR-001, BND-001                    |
| AUTH-002 | Capability grants                | Roles receive explicit allow and deny capabilities over scoped orchestration resources and operations.                                           | AUTH-001, SHR-004                   |
| AUTH-003 | Assignment and execution binding | A capability can be bound to one campaign, workspace, job, attempt, execution, and transport incarnation.                                        | AUTH-001, AUTH-002                  |
| AUTH-004 | Execution credential lifecycle   | The system can issue, validate, expire, revoke, and rotate short-lived execution-scoped credentials without exposing general database authority. | AUTH-003, SHR-003                   |
| AUTH-005 | Scoped-operation authorization   | Every CLI, MCP, service, hook, monitor, transport, evidence, and verdict operation receives one deterministic allow or deny decision.            | AUTH-002, AUTH-003, AUTH-004        |
| AUTH-006 | Attributed denial evidence       | Denials preserve actor, role, scope, operation, policy version, source package, and safe rationale as durable evidence.                          | AUTH-005, BND-002, BND-003, BND-006 |

## Optional Features

None. External identity-provider integration is outside the accepted V1 intent.

## Cross-Domain Dependencies

- `shared:SHR-001` — stable actor, role, resource, and capability scalar types.
- `shared:SHR-003` — credential expiry and policy deadlines.
- `shared:SHR-004` — explicit authorization outcomes.
- `boundary:BND-001` — Auth owns a stable error-source namespace.
- `boundary:BND-002` — authorization failures preserve causal provenance.
- `boundary:BND-006` — denials expose role-appropriate views.

## Layer Boundary

This file defines authorization capabilities. It does not implement PostgreSQL grants, parse CLI arguments, launch agents, reduce process state, or confer authority through a model name.

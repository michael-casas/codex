# Shared — Features

**Status:** Accepted
**Domain authority:** [DOMAINS.md — Shared](../../../DOMAINS.md#1-shared)
**Package:** `packages/shared`
**Boundary:** Repeated, domain-neutral type or utility need → one stable reusable primitive without importing orchestration policy or infrastructure.

## Core Features

| ID      | Feature                                       | Outcome                                                                                                                                          | Depends on       |
| ------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| SHR-001 | Runtime-neutral shared types                  | Packages reuse branded scalars, identifiers, and structural type helpers without importing another production domain.                            | —                |
| SHR-002 | Deterministic serialization and digests       | Equivalent supported values serialize canonically and produce stable digests across processes and replays.                                       | SHR-001          |
| SHR-003 | Time, duration, and deadline primitives       | Packages express clocks, instants, durations, deadlines, and expiry without embedding wall-clock assumptions in domain policy.                   | SHR-001          |
| SHR-004 | Result, assertion, and validation composition | Packages compose explicit results, exhaustive matches, assertions, and schema-validation outcomes without inventing incompatible utility shapes. | SHR-001          |
| SHR-005 | Safe diagnostic values                        | Shared redaction and diagnostic-value helpers prevent secrets or unbounded payloads from leaking into errors, events, or projections.            | SHR-001, SHR-002 |

## Optional Features

None. A proposed shared utility must first prove use by more than one domain and compliance with the domain-neutrality boundary.

## Cross-Domain Dependencies

None. `shared` is the dependency-minimal common kernel.

## Layer Boundary

This file defines reusable domain-neutral capabilities. It does not authorize a miscellaneous utility collection, encode orchestration policy, choose source files, or sequence implementation.

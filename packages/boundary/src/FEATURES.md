# Boundary — Features

**Status:** Accepted
**Domain authority:** [DOMAINS.md — Boundary](../../../DOMAINS.md#2-boundary)
**Package:** `packages/boundary`
**Boundary:** Unknown or package-local failure → one source-attributed, causally linked, safely serializable boundary error.

## Core Features

| ID      | Feature                                  | Outcome                                                                                                                                  | Depends on                |
| ------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| BND-001 | Package source and error-code namespaces | Every production package can identify itself and issue stable, collision-free error codes.                                               | SHR-001                   |
| BND-002 | Boundary error and causal-chain contract | Failures cross package boundaries with an originating source, stable code, message, preserved cause, and correlation identity.           | BND-001, SHR-004          |
| BND-003 | Structured fault metadata                | Errors carry bounded safe context plus fault class, severity, retryability hint, and operator-action metadata without deciding policy.   | BND-002, SHR-003, SHR-005 |
| BND-004 | Unknown-error normalization              | Thrown strings, native errors, rejected values, and foreign failures become valid boundary errors without losing the original cause.     | BND-002, BND-003          |
| BND-005 | Cross-boundary serialization             | Boundary errors round-trip across process, CLI, MCP, Unix-socket, hook, artifact, and generated-projection seams with provenance intact. | BND-002, BND-003, SHR-002 |
| BND-006 | Redacted error views                     | Internal, operator, and public projections expose only the context appropriate to that view while retaining stable attribution.          | BND-003, BND-005, SHR-005 |
| BND-007 | Wrapped and aggregate provenance         | Rethrown, wrapped, and multi-cause failures preserve every contributing package boundary without replacing the originating source.       | BND-002, BND-004, BND-005 |

## Optional Features

None. Domain-specific error catalogs belong to their owning packages.

## Cross-Domain Dependencies

- `shared:SHR-001` — package and code identities use shared neutral types.
- `shared:SHR-002` — serialized error envelopes and digests must be deterministic.
- `shared:SHR-003` — timing and expiry metadata use common primitives.
- `shared:SHR-004` — normalization and validation return explicit outcomes.
- `shared:SHR-005` — every error view uses common redaction primitives.

## Layer Boundary

This file defines error provenance and representation. It does not choose retry, repair, judgment, acceptance, logging transport, or implementation classes beyond the required boundary contract.

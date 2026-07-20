# DISTRIBUTED_FEATURES — Per-Domain Atomic Feature IR

## What

The Layer 3 contract that lowers one accepted root `DOMAINS.md` into one
canonical feature document per domain:

```text
packages/<domain>/src/FEATURES.md
```

A root `FEATURES.md` MAY exist as a generated or authored navigation index. It
MUST contain links and summary counts only; it is never feature authority.

## Why

A monolithic feature document and a `packages/domains/` umbrella hide real
package ownership and weaken dependency-aware affected selection. Distributed
feature authority keeps each domain independently addressable by Nx and gives
every atomic feature one unambiguous owner.

## Input

- One accepted root `DOMAINS.md`
- Every explicit human amendment to that domain layer
- No roadmap, implementation plan, or downstream DAG

## Output Contract

For every accepted domain named `<domain>`, write exactly one canonical file:

```text
packages/<domain>/src/FEATURES.md
```

Do not create `packages/domains/<domain>`.

If the package does not yet exist, Layer 3 MAY create only the directories and
feature document needed to hold the IR when the user authorizes that write. It
MUST NOT scaffold source code, project configuration, tests, or an application
as an implicit side effect of documentation lowering.

## Canonical Per-Domain Shape

```markdown
# <Domain> — Features

**Status:** Proposed | Accepted
**Domain authority:** ../../../DOMAINS.md#<domain-anchor>
**Package:** packages/<domain>
**Boundary:** <one sentence copied or faithfully lowered from DOMAINS.md>

## Core Features

| ID | Feature | Outcome | Depends on |
|---|---|---|---|
| <PREFIX>-001 | <atomic capability> | <observable result> | — |

## Optional Features

| ID | Feature | Outcome | Depends on |
|---|---|---|---|
| <PREFIX>-101 | <atomic capability> | <observable result> | <feature IDs> |

## Cross-Domain Dependencies

- `<other-domain>:<feature-id>` — <why this dependency is required>

## Layer Boundary

This file defines what the domain must provide. It does not choose timelines,
implementation tasks, source files, schemas, commands, or DAG assignments.
```

## Atomicity Rules

Each feature MUST:

- belong to exactly one accepted domain;
- express one independently understandable capability and observable outcome;
- have a stable ID unique across the repository;
- classify as core or optional;
- name dependencies by stable feature ID rather than prose position;
- preserve the owning domain boundary from `DOMAINS.md`;
- avoid implementation sequencing, task assignment, estimates, and timelines;
- avoid duplicating a cross-cutting law as a feature in every domain.

A feature is too broad when it joins capabilities that could be accepted,
changed, or affected independently. A feature is too narrow when it names a
single source file, function, table column, CLI flag, or test case rather than a
product capability.

## Cross-Domain Ownership

When a feature consumes another domain:

1. The provider capability is defined only in the provider's `FEATURES.md`.
2. The consumer lists the provider feature ID under cross-domain dependencies.
3. The consumer MUST NOT copy or redefine the provider feature.
4. A dependency that contradicts the accepted domain graph requires an explicit
   human amendment to `DOMAINS.md` before feature lowering continues.

## Optional Root Index

An optional root `FEATURES.md` may contain:

```markdown
# Feature Index

| Domain | Canonical authority | Core | Optional |
|---|---|---:|---:|
| auth | [packages/auth/src/FEATURES.md](packages/auth/src/FEATURES.md) | 6 | 1 |
```

It MUST NOT contain canonical feature descriptions, dependency definitions, or
acceptance verdicts. If index content conflicts with a domain file, the domain
file wins and the index must be regenerated.

## Validation

Layer 3 is complete only when:

- every accepted domain has exactly one canonical `FEATURES.md`;
- no unaccepted domain feature file is introduced;
- every feature ID is unique;
- every dependency resolves;
- the feature dependency graph is acyclic or an explicit human verdict records
  why a cycle is unavoidable;
- every feature has one owner and one observable outcome;
- no feature leaks roadmap phases, implementation tasks, or DAG assignments;
- the physical domain paths preserve independent Nx project ownership and
  affected selection;
- any root index contains links and projections only.

## Non-Goals

This layer does not:

- scaffold Nx projects;
- define source architecture;
- write Gherkin scenarios or tests;
- select applications, CLI commands, MCP tools, tables, or protocols;
- prioritize or sequence work;
- compile an implementation DAG;
- amend domain ownership without explicit human authority.

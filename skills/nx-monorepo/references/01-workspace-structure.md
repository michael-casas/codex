# 01 — Workspace Structure

> Reference doc for the nx-monorepo skill. How the workspace is laid out, how projects are named,
> tagged, and allowed to depend on each other.

## TL;DR

- Two project surfaces: `apps/` (deployable orchestration) and `packages/` (reusable mechanics).
- Flat project roots. No `packages/shared/*` nesting, no one-project-per-slice explosion.
- Directory names carry **no org prefix**; the scope lives in the package name
  (`packages/core` → `@arcana-market/core`).
- Every project gets `type:` / `scope:` / `layer:` tags; module boundaries are lint-enforced.
- Directory = context, file = role (FILE-SYSTEM law): `schema.ts`, `model.ts`, `contracts.ts` —
  never `registry-schema.ts` inside `registry/`. Kebab-case directories. Barrel-only imports.

## apps/ vs packages/

|            | `apps/`                                                                | `packages/`                                                    |
| ---------- | ---------------------------------------------------------------------- | -------------------------------------------------------------- |
| Role       | Deployable delivery shims: web app, CLI entry, MCP server, e2e harness | Reusable mechanics: domain logic, UI kit, clients, foundations |
| Owns       | Wiring, composition roots, route handlers, process lifecycle           | Business rules, schemas, operations, components                |
| Depends on | packages (freely, per boundary matrix)                                 | other packages only — **never** on apps                        |
| Versioned  | Private, deployed                                                      | Versioned via changesets (see `04-version-management.md`)      |

An app that contains business logic is a structure bug. A package that imports from an app is a
graph bug (Nx will usually flag the cycle; don't wait for it).

## Project naming

- Directory: short, kebab-case, unprefixed — `apps/cli`, `packages/db`.
- Package name: scoped — `"name": "@arcana-market/cli"` in `package.json`.
- Nx project name follows the package name via the `@nx/js` plugin inference.
- Existing projects keep their names; the rule applies to new projects.

## Tags and module boundaries

Give every project one tag per axis in `project.json` (or `package.json > nx.tags`):

```jsonc
{ "tags": ["type:app", "scope:agent", "layer:delivery"] }
```

Enforce with `@nx/enforce-module-boundaries` in the root eslint config — replace any wildcard
`* → *` rule with an explicit matrix:

```js
'@nx/enforce-module-boundaries': ['error', {
  depConstraints: [
    { sourceTag: 'type:app', onlyDependOnLibsWithTags: ['type:lib'] },
    { sourceTag: 'layer:ui', onlyDependOnLibsWithTags: ['layer:ui'] },
    { sourceTag: 'layer:foundation', onlyDependOnLibsWithTags: ['layer:foundation'] },
    // one row per allowed edge — absence of a row means the edge is forbidden
  ],
}],
```

Wildcard boundary rules are worse than none: they look like governance while allowing everything.

## Subpath exports for split surfaces

When one package must expose both a server surface and a client-safe surface, use subpath
exports instead of splitting into two projects:

```jsonc
// packages/domains/package.json
"exports": {
  ".": "./src/index.ts",                    // server facade — apps only
  "./contracts": "./src/contracts.ts",      // client-safe Zod — clients/agents
  "./schema": "./src/schema.ts"             // infra exception — db aggregation only
}
```

Back each restricted subpath with a boundary test proving it has no transitive server-only
imports (drivers, env readers, provider SDKs).

## FILE-SYSTEM law (naming inside a project)

- **Directory = context, file = role.** Inside `registry/`, the schema file is `schema.ts`,
  never `registry-schema.ts`. The path already says "registry".
- Kebab-case directories, max nesting `{domain}/{slice}`.
- Barrel-only imports across slices: consumers import `registry`'s `index.ts`, never
  `registry/internal/whatever.ts`.
- Canonical text: Agent Wiki `standards/File System.md` (`casona-ai/governance/FILE-SYSTEM.md`).

## Config files quick anatomy

- `nx.json` — workspace-level: `plugins` (inferred targets), `targetDefaults`, `namedInputs`,
  `defaultBase`. Read it directly; see `03-tasks-and-caching.md` for tuning.
- `project.json` / `package.json` — per-project. **Never read `project.json` to learn a
  project's targets** — plugins infer most of them. Use `nx show project <name> --json`
  (nx-workspace skill).
- `pnpm-workspace.yaml` — the package-manager workspace globs (`apps/*`, `packages/*`).
  Nx discovers projects from it; adding a directory there is step zero of a new surface.

## This repo

The ratified project set, tag matrix, dependency graph, and domain-internal import rules live in
`docs/decisions/ARCHITECTURE-RATIFIED.md` (ADR-W0-08, W0-09, W0-15) and
`docs/decisions/WORKSPACE-ARCHITECTURE.md` §1. When this reference and those documents
disagree, the ratified architecture wins.

## Review checklist

- [ ] New project is under `apps/` or `packages/` with a flat root and kebab-case name
- [ ] No org prefix in the directory; scope in the package name
- [ ] `type:` / `scope:` / `layer:` tags set; boundary matrix updated (no wildcard rules)
- [ ] Files named by role, not by parent context
- [ ] Cross-project imports go through the barrel or a declared subpath export
- [ ] No package imports from `apps/*`

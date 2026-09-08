---
name: nx-monorepo
description: Canonical router for work in an Nx monorepo. Use for workspace exploration, generators, task execution and caching, plugins, repository imports, project boundaries, package linking, releases, CI, quality gates, ownership, or Nx-specific troubleshooting. Route to the relevant bundled reference and obey the repository's own package manager, commands, architecture, and policies. Do not use for framework-internal design that does not affect the workspace layer.
---

# Nx Monorepo

This is the global entrypoint for Nx workspace work. Route first and load only the references
needed for the request.

## Precedence and discovery

1. Read the nearest applicable `AGENTS.md`, repository documentation, `package.json`, lockfile,
   and `nx.json` before acting. Repository rules override every example in this skill.
2. Detect the package manager and use its workspace-local execution form (`bunx nx`,
   `pnpm nx`, `yarn nx`, or `npx nx`). Never impose the package manager shown in an example.
3. Prefer Nx targets over invoking underlying build, lint, test, or serve tools directly.
4. Inspect resolved configuration with Nx. Plugins can infer targets that are absent from
   `project.json`.
5. Verify volatile flags, generator options, plugin APIs, and action versions with `--help`,
   Nx tooling, or official Nx documentation. Never guess unfamiliar flags.

## Operational router

| Task | Read |
| --- | --- |
| Explore projects, targets, dependencies, or debug missing project/target errors | [workspace exploration](references/operations/nx-workspace/guide.md) |
| Determine affected projects or changes | [affected projects](references/operations/nx-workspace/references/AFFECTED.md) |
| Scaffold or generate an app, library, component, or other artifact | [generators](references/operations/nx-generate/guide.md) first |
| Run build, test, lint, serve, typecheck, or another target | [task execution](references/operations/nx-run-tasks/guide.md) |
| Discover or add Nx plugins | [plugins](references/operations/nx-plugins/guide.md) |
| Import or merge another repository while preserving history | [repository import](references/operations/nx-import/guide.md), then only its technology-specific references that apply |
| Link sibling workspace packages or repair workspace package resolution | [workspace package linking](references/operations/link-workspace-packages/guide.md) |
| Monitor Nx Cloud CI or handle self-healing fixes | [Nx Cloud CI monitoring](references/operations/monitor-ci/guide.md); load its scripts and fix-flow reference only as directed there |

Scaffolding is the one strict routing priority: read the generator reference before exploring
or invoking other Nx tooling because generator discovery is part of that workflow.

## Workspace and process patterns

The Arcana Market source includes opinionated workspace/process references. They are useful
patterns, not global policy. Read one only when the repository already uses the relevant model
or the user asks to introduce/evaluate it. Do not infer `apps/` versus `packages/`, changesets,
pnpm, a branch model, BATDD, CODEOWNERS, or a particular CI layout from this skill.

| Topic | Reference |
| --- | --- |
| Project topology, tags, boundaries, exports, naming | [workspace structure](references/01-workspace-structure.md) |
| App-local orchestration versus reusable packages | [code structure](references/02-code-structure.md) |
| Task graphs, affected execution, inputs, outputs, caching | [tasks and caching](references/03-tasks-and-caching.md) |
| Changesets-based versioning, when already selected | [version management](references/04-version-management.md) |
| GitHub Actions, affected gates, trust boundaries | [CI/CD](references/05-ci-cd.md) |
| Hooks, formatting, lint, filenames, commitlint | [quality gates](references/06-quality-gates.md) |
| Trunk/stacked-PR and breaking-change patterns | [collaboration](references/07-collaboration.md) |
| CODEOWNERS and cross-team routing patterns | [ownership and routing](references/08-ownership-and-routing.md) |
| Nx target integration for an existing BATDD practice | [behavioral acceptance testing](references/09-behavioral-acceptance-testing.md) |

## Structural decision checks

Before creating or moving projects:

- Preserve the repository's established project roots and naming conventions.
- Create a deployable project for a distinct runtime or artifact.
- Extract reusable code only when the repository's architecture and real consumers justify a
  project boundary.
- Declare and enforce dependency boundaries using the repository's tag vocabulary.
- Add workspace dependencies with the package manager rather than masking resolution with
  ad-hoc TypeScript paths.
- Use the appropriate generator, dry-run when supported, inspect the proposed file placement,
  and validate the affected surface through Nx.

## Source and annexation

Promoted from `arcana-market/arcana-market` at commit
`648a641c307e3774ea5e0944fcae51723f702f4a`. The former standalone `nx-workspace`,
`nx-generate`, `nx-run-tasks`, `nx-plugins`, `nx-import`, `link-workspace-packages`, and
`monitor-ci` skills are annexed under `references/operations/`. Their former entrypoints are
plain `guide.md` references so they are not discovered as standalone skills. Extend those
references instead of restoring standalone copies.

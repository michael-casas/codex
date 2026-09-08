# 05 — CI/CD (GitHub Actions + Nx)

> Reference doc for the nx-monorepo skill. GitHub Actions is the CI provider; Nx is the only
> task orchestrator inside CI. For watching runs and self-healing fixes, use the **monitor-ci**
> skill — prefer it over raw `gh run` polling.

## TL;DR

- Branch model is S7 three-tier (ref 07): PRs target **development**; `nx affected`
  diffs against it (`nx-set-shas` with `main-branch-name: development`); pushes to the
  promotion branches (staging, main) run the full `run-many` sweep.
- CI never calls underlying tools directly — everything goes through Nx so caching,
  `dependsOn`, and the graph apply.
- Releases are the changesets workflow (`04-version-management.md`), not a CI special case.
- Split workflows by concern and trust level, not by project.

## The canonical PR workflow

```yaml
# .github/workflows/ci.yml
name: CI
on:
  pull_request:
  push:
    branches: [main]
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  main:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # required for affected
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile

      - uses: nrwl/nx-set-shas@v4 # sets NX_BASE / NX_HEAD correctly for PRs & main

      - run: pnpm changeset status --since=$NX_BASE # version gate (04)
      - run: pnpm nx affected -t lint typecheck test build
```

Key mechanics:

- `nrwl/nx-set-shas` derives the right base SHA (last successful main run) — better than a raw
  `--base=origin/main` on long-lived branches.
- One `affected` invocation with multiple targets beats sequential jobs for scheduling; split
  into parallel jobs only when wall-clock demands it and steps don't share warm state.
- `--frozen-lockfile` always. A lockfile drift failure is a real failure.

## Additional gates worth their cost

```yaml
- run: pnpm nx graph --print | node scripts/check-circulardeps.mjs # cycle gate
- run: pnpm changeset status --since=$NX_BASE # changeset presence
# manual-version-edit gate: fail if any packages/*/package.json version changed in the diff
```

Codegen drift gate (when a package checks in generated artifacts): regenerate in CI and
`git diff --exit-code` — a dirty tree means someone edited outputs or forgot to regenerate.

## Workflow separation doctrine

Split by **concern and credential trust level**:

| Workflow     | Trigger          | Runs                                                                     | Credentials                                     |
| ------------ | ---------------- | ------------------------------------------------------------------------ | ----------------------------------------------- |
| `ci`         | PR + main        | affected lint/typecheck/unit/build + gates                               | none                                            |
| `contract`   | PR + main        | integration tests vs ephemeral service containers (e.g. Docker Postgres) | none                                            |
| `e2e`        | PR label / main  | browser tests vs a production build                                      | none                                            |
| `acceptance` | main / schedule  | full acceptance + invariant gates                                        | none                                            |
| `release`    | push to main     | changesets version-or-publish (see 04)                                   | `GITHUB_TOKEN` (+ registry token if publishing) |
| `deploy`     | release / manual | build + migrate + deploy                                                 | production secrets, protected environment       |

Hard rule: **PR-triggered jobs never receive production credentials.** Production secrets live
only in `deploy` behind a protected environment. Test workflows get ephemeral containers, never
shared/staging databases.

This repo's ratified five-workflow set and its invariant gates: ADR-W0-13 in
`docs/decisions/ARCHITECTURE-RATIFIED.md`.

## Selective deployment

Deploy an app only when it (or a dependency) changed. Derive it from the graph, not from path
globs:

```bash
pnpm nx show projects --affected --type app --base=$NX_BASE --head=$NX_HEAD
```

Path-glob triggers (`paths: apps/web/**`) miss dependency-driven changes — a `packages/ui` fix
must redeploy the apps that consume it. The graph knows; globs don't.

## Nx Cloud / monitoring

- Remote caching + distributed execution: `pnpm nx connect`, then CI picks it up via the access
  token env var.
- Watching a running pipeline, retrieving failures, and applying self-healing fixes is the
  **monitor-ci** skill ("monitor ci", "watch ci for this branch"). Use it instead of hand-rolled
  `gh run watch` loops.

## Review checklist

- [ ] `fetch-depth: 0` + `nx-set-shas` on every affected-based job
- [ ] All task execution goes through `pnpm nx …`
- [ ] Changeset presence + manual-version gates present on PRs
- [ ] No production secret reachable from a PR-triggered workflow
- [ ] Deploy conditions derived from the project graph, not path globs
- [ ] `concurrency` groups set so superseded runs cancel

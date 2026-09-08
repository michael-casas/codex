# 04 — Version Management (Changesets)

> Reference doc for the nx-monorepo skill. **Changesets is the single source of truth for
> package versions, changelogs, and releases.** Manual version bumps are forbidden and
> CI-rejected. `nx release` is not used — one versioning system, not two.

## TL;DR

- Every PR that changes a published/consumed package ships a changeset file describing the bump.
- Versions and changelogs are only ever written by `changeset version` — never by hand.
- Releases run through the `changesets/action` GitHub workflow: it opens a "Version Packages"
  PR; merging that PR is the release act.
- Apps are `private: true` and are not npm-published; packages are the versioned units.

## Setup

```bash
pnpm add -Dw @changesets/cli
pnpm changeset init
```

```jsonc
// .changeset/config.json
{
  "$schema": "https://unpkg.com/@changesets/config/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "restricted",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "privatePackages": { "version": true, "tag": true },
  "ignore": [],
}
```

Notes:

- `updateInternalDependencies: "patch"` — when `@arcana-market/db` bumps, dependents that
  reference it get a patch bump automatically. This is the internal-consistency engine.
- `privatePackages: { version: true, tag: true }` — private packages still get versions and git
  tags even without npm publishing; version history stays meaningful for internal packages.
- `fixed` / `linked` stay empty by default: independent versioning. Only link packages whose
  versions genuinely must move together (e.g. a client and its codegen artifact).

## The developer loop

```bash
# 1. Make the change
# 2. Record its intent
pnpm changeset          # interactive: pick packages, pick bump, write the summary
# 3. Commit the generated .changeset/*.md WITH the code change
```

A changeset file is plain markdown — reviewable, editable, mergeable:

```markdown
---
'@arcana-market/ui': minor
'@arcana-market/api-client': patch
---

Add Combobox primitive; regenerate client types for the new SearchListings operation.
```

Bump semantics (semver, honestly applied):

- **patch** — bug fix, internal change, no API surface change
- **minor** — new capability, backward compatible
- **major** — breaking change; requires the breaking-change protocol in `07-collaboration.md`

Changes that don't touch a versioned package's shipped behavior (docs, CI, `.agent/`, tests
only) need no changeset — CI's `changeset status` check accounts for this via empty changesets
(`pnpm changeset --empty`) when the gate demands one.

## What CI enforces

1. **No manual version edits.** A PR that diffs any `packages/*/package.json > version` field
   fails the gate — versions belong to `changeset version` only.
2. **Changeset presence.** `pnpm changeset status --since=origin/main` fails when a versioned
   package changed with no changeset.

Both gates live in the `ci` workflow — see `05-ci-cd.md`.

## The release flow

Under the S7 branch model (ref 07): feature PRs carry changesets into **development**;
changesets accumulate there and ride each promotion (development → staging → main)
untouched. Only the merge into **main** triggers the version flow. `baseBranch` in
`.changeset/config.json` is `development` (that's where PR status checks diff against).

```
feature PRs (code + changesets) → development → staging → main
        │
        ▼  merge to main
changesets/action: finds pending changesets
        │
        ├─ pending → opens/updates "Version Packages" PR
        │            (runs `changeset version`: bumps versions, writes CHANGELOGs,
        │             deletes consumed changesets)
        │
        ▼  human merges the Version Packages PR
changesets/action: no pending changesets, versions changed
        │
        └─ tags releases (and publishes to the registry, when/if we publish)
```

Workflow skeleton (full CI context in `05-ci-cd.md`):

```yaml
# .github/workflows/release.yml
name: Release
on:
  push:
    branches: [main]
concurrency: release-${{ github.ref }}
jobs:
  release:
    runs-on: ubuntu-latest
    permissions: { contents: write, pull-requests: write }
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm nx run-many -t build
      - uses: changesets/action@v1
        with:
          version: pnpm changeset version
          # publish: pnpm changeset publish   # enable only when packages go to a registry
          commit: 'chore: version packages'
          title: 'chore: version packages'
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Pre-releases and snapshots

```bash
# Pre-release channel (next/beta/rc)
pnpm changeset pre enter next
pnpm changeset version        # produces 2.1.0-next.0
pnpm changeset pre exit

# One-off snapshot from a branch/PR (canary)
pnpm changeset version --snapshot canary
pnpm changeset publish --tag canary --no-git-tag
```

Snapshots never merge back — they exist to let a consumer test a branch build.

## Hard rules

- ❌ Never edit a `version` field by hand.
- ❌ Never run `changeset version`/`publish` locally against main — the release workflow owns it.
- ❌ Never mix `nx release` into this repo — two version writers means neither is the truth.
- ✅ One changeset per logical change; multiple packages in one changeset is correct when they
  change together.
- ✅ Write changeset summaries for the CHANGELOG reader (the consumer), not the diff reader.

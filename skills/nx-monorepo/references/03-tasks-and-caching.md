# 03 — Tasks, Affected, and Caching

> Reference doc for the nx-monorepo skill. Running work through Nx, scoping it with affected,
> and making the cache trustworthy. For interactive exploration commands, the **nx-workspace**
> skill is the tool; for generator syntax, **nx-generate**; for plugin discovery, **nx-plugins**.

## TL;DR

- Always run tasks through Nx (`pnpm nx …`), never the underlying tool directly — otherwise you
  bypass the graph, the cache, and `dependsOn` ordering.
- PR-scoped work uses `nx affected`; full sweeps use `nx run-many --all`.
- Caching is only as good as declared `inputs`/`outputs` — undeclared outputs are silent cache
  poison.
- Prefix every command with the workspace package manager (`pnpm nx …`).

## Running tasks

```bash
pnpm nx build my-app                      # single project
pnpm nx run-many -t build test lint       # all projects
pnpm nx run-many -t build -p app-a,lib-b  # specific projects
pnpm nx run-many -t test -p 'tag:scope:client'   # by tag
pnpm nx affected -t lint typecheck test build    # only what changed
pnpm nx affected -t build --base=origin/main --head=HEAD
```

Multiple targets in one invocation (`-t lint typecheck test build`) lets Nx interleave the
schedule — prefer it over four sequential commands.

## Affected

`affected` computes changed projects from git (`--base`/`--head`, default `defaultBase` in
`nx.json`) plus the project graph — a change in a package marks all its dependents affected.

```bash
pnpm nx show projects --affected           # what would run
pnpm nx affected -t test --exclude='*-e2e' # carve-outs
```

Gotchas:

- CI needs `fetch-depth: 0` (or `nrwl/nx-set-shas`) — a shallow clone can't diff against base.
- Changes to root config (`nx.json`, root `eslint.config.mjs`, lockfile) affect **everything**
  by design. Don't "fix" that; it's correctness.
- Deleted-only changes still affect dependents.

## Task pipeline (`targetDefaults`)

```jsonc
// nx.json
{
  "targetDefaults": {
    "build": { "dependsOn": ["^build"], "cache": true },
    "test": { "cache": true },
    "lint": { "cache": true },
  },
}
```

- `^build` = "my dependencies' build first". This is how `nx build app` transparently builds the
  packages it depends on.
- Most targets in a plugin-inferred workspace come from `nx.json > plugins` — check
  `nx show project <name> --json` (nx-workspace skill) before assuming a target exists.

## Caching

```bash
pnpm nx build my-app   # first run executes; identical re-run restores from cache
pnpm nx reset          # nuke local cache + daemon when things look stale
nx sync                # when "workspace out of sync" errors appear
```

**Inputs** decide the cache key; **outputs** decide what gets restored:

```jsonc
"build": {
  "inputs": ["production", "^production", { "externalDependencies": ["next"] }],
  "outputs": ["{projectRoot}/dist"]
}
```

- Use the `production` named input for build-like targets so test-file edits don't bust build
  caches (`namedInputs` in `nx.json`).
- If a target writes files not listed in `outputs`, cache hits will silently skip creating them.
  Symptom: "works after `nx reset`, breaks after cache hit" — fix the `outputs` declaration.
- Never cache targets with side effects outside the workspace (deploys, publishes, migrations).

Remote cache (Nx Cloud): `pnpm nx connect`. CI monitoring and self-healing for it is the
**monitor-ci** skill's job.

## Troubleshooting

| Symptom                                       | Move                                                                                                                |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| "Cannot find configuration for task X:target" | `nx show project X --json \| jq '.targets \| keys'` — target may be plugin-inferred under another name              |
| "Cannot find project"                         | `pnpm nx reset` then re-run; check `pnpm-workspace.yaml` globs include the directory                                |
| Stale/wrong cache behavior                    | Verify `inputs`/`outputs`, then `pnpm nx reset`                                                                     |
| Suspected circular dependency                 | `pnpm nx graph --print \| jq '.graph.dependencies'` and trace the cycle; CI should gate on this (see `05-ci-cd.md`) |
| Task works locally, fails in CI               | Usually an undeclared input (env var, untracked file) or missing `fetch-depth: 0`                                   |

## Review checklist

- [ ] Tasks invoked via `pnpm nx …`, not raw tool binaries
- [ ] New targets declare `inputs` and `outputs` if cacheable; side-effect targets are not cached
- [ ] `dependsOn` uses `^` where dependency builds are required
- [ ] CI uses `affected` on PRs, `run-many --all` on main/scheduled runs

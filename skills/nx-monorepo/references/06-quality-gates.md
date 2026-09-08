# 06 — Quality Gates (Hooks, Formatting, Lint, Filename Law)

> Reference doc for the nx-monorepo skill. The local gate stack: husky + lint-staged +
> prettier + eslint + ls-lint + commitlint. Catch it at commit time; CI re-verifies.

## TL;DR

- Hooks are a fast local mirror of CI, not a replacement — CI re-runs everything.
- lint-staged runs prettier + eslint on **staged files only**; whole-graph checks stay in CI.
- ls-lint enforces the FILE-SYSTEM naming law (kebab-case dirs, role filenames) mechanically.
- commitlint enforces conventional commits — the same grammar changesets and reviewers rely on.

## Husky + lint-staged

```bash
pnpm add -Dw husky lint-staged
pnpm husky init
```

```bash
# .husky/pre-commit
pnpm lint-staged
```

```jsonc
// package.json (root)
"lint-staged": {
  "*.{ts,tsx,js,jsx,mjs}": ["prettier --write", "eslint --fix --no-warn-ignored"],
  "*.{json,md,yml,yaml,css}": ["prettier --write"]
}
```

Rules of engagement:

- Pre-commit stays **fast** (< a few seconds): staged-file formatting and lint only. No builds,
  no tests, no typecheck — a slow hook trains people to `--no-verify`.
- Anything graph-aware (`nx affected -t test`) belongs in CI or, at most, pre-push.
- Hooks are convenience; CI is authority. Never treat a green hook as verification.

## Prettier + ESLint division of labor

- **Prettier owns formatting.** No stylistic ESLint rules; `eslint-config-prettier` is last in
  the flat config to disable conflicts.
- **ESLint owns correctness and boundaries.** The two rules that make it monorepo-aware:
  - `@nx/enforce-module-boundaries` — the tag matrix from `01-workspace-structure.md`
  - import hygiene (`eslint-plugin-import`) — no deep imports into other projects' internals
- One root flat config (`eslint.config.mjs`); projects extend, never fork, the root.

## ls-lint — filename law as a lint

ls-lint (<https://ls-lint.org>) checks file and directory **names**, which ESLint cannot do.
It is the mechanical enforcement of the FILE-SYSTEM law.

```bash
pnpm add -Dw @ls-lint/ls-lint
```

```yaml
# .ls-lint.yml
ls:
  packages/*/src/**:
    .dir: kebab-case
    .ts: kebab-case
    .tsx: kebab-case
  apps/*/src/**:
    .dir: kebab-case | regex:\[[a-z-]+\] | regex:\([a-z-]+\) # Next dynamic/group segments
    .ts: kebab-case
    .tsx: kebab-case

ignore:
  - node_modules
  - dist
  - .next
```

What ls-lint cannot check — parent-name-prefixed files (`registry/registry-schema.ts`) and
barrel-bypass imports — is covered by review (checklist below) and, where feasible, a custom
lint rule. Wire ls-lint into both lint-staged and the `ci` workflow.

## commitlint — conventional commits

```bash
pnpm add -Dw @commitlint/cli @commitlint/config-conventional
```

```js
// commitlint.config.mjs
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [2, 'always', ['arcana', 'cli', 'mcp', 'domains', 'ui', 'api-client', 'core', 'db', 'testkit', 'workspace', 'ci', 'deps', 'skills']],
  },
};
```

```bash
# .husky/commit-msg
pnpm commitlint --edit "$1"
```

Format: `type(scope): description` — `feat(ui): add combobox primitive`. Scopes are project
directory names (update `scope-enum` when projects are added). Note: commit types do **not**
drive version bumps — changesets does (`04-version-management.md`); conventional commits are for
history legibility and review routing.

## Order of operations when configuring from scratch

1. Prettier root config + `pnpm nx format:write` once to settle the baseline
2. ESLint boundaries matrix (tags first — see 01)
3. husky + lint-staged (pre-commit)
4. commitlint (commit-msg hook)
5. ls-lint (lint-staged + CI)
6. Mirror every gate in the `ci` workflow (`05-ci-cd.md`) — hooks can be skipped; CI cannot

## Review checklist

- [ ] Pre-commit runs in seconds and touches staged files only
- [ ] Every hook gate has a CI twin
- [ ] No stylistic ESLint rules fighting prettier
- [ ] Boundary rule matrix present, no wildcard `* → *`
- [ ] File/dir names kebab-case; no parent-name-prefixed role files
- [ ] Commit messages conventional with a valid scope

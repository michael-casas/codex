# Codex Workflows Implementation Report

**Campaign:** `CDX-WF-2026-08-07`  
**Green Contract:** `CDX-WF-GC-1`  
**Candidate basis:** repository `HEAD` `28c4650c676644bdfac11aa25c46d5be9b15f833` plus the current uncommitted/untracked working tree described below  
**Role boundary:** implementation evidence only; this is not independent verification or acceptance

> **Attempt 1 reconciliation (2026-08-08):** The independent
> `codex-workflows-external-audit-attempt-1.md` preserves this Phase-A report as
> authored evidence but found that its historical RED claims were not
> immutably registered and found material defects `CWF-AUD-001` through
> `CWF-AUD-006`. The bounded repair records present-day recovery re-proof in
> `codex-workflows-repair-attempt-1.md`; that artifact is explicitly not
> historical RED proof, Preflight approval, verification, judgment, or
> acceptance.

> **Attempt 2 reconciliation (2026-08-08):** The independent
> `codex-workflows-external-audit-attempt-2.md` found that the prior repair did
> not enforce full private SDK-host admission equality, could certify
> unproven/permissive standing-target discovery, and serialized a zero-selected
> child as nonzero (`CWF2-AUD-001` through `003`). The bounded successor repair
> and present-day evidence are recorded in
> `codex-workflows-repair-attempt-2.md`. The historical body below is preserved;
> it is not Preflight, reducer approval, verification, judgment, or acceptance.

**Current-candidate reconciliation:** this report preserves the Phase-A
implementation evidence. The later self-audit found five bounded gaps, all of
which are closed with additive RED→GREEN evidence in
`docs/reports/codex-workflows-reimplementation-report.md`. Current machine
artifacts therefore contain 7 workflows L1 integration tests and 7 Codex L1
integration tests rather than the initial 3 and 4 shown below.

## Outcome

The architecture in `docs/reports/codex-workflows-sdk-architecture-report.md`
is implemented as one vertical slice:

- `@orchestration/workflows` validates version-1 JSON sources and JSON Schema
  2020-12 inputs, normalizes graphs, creates canonical SHA-256 digests, plans
  conditions/fan-out/joins/subworkflows/artifacts, and parses legacy `.pi` bytes.
- `@orchestration/codex` is the sole production boundary for
  `@openai/codex-sdk` `0.147.0`. It owns a secret-free process-local singleton,
  lifecycle draining, per-thread admission, buffered and streamed turns,
  repository-owned events, structured output, abort handling, and a controlled
  SDK process test. The bounded repair adds non-persistent, secret-safe
  per-operation observations without adding durable state.
- `@orchestration/codex-workflows` is a bundled Node ESM CLI with an executable
  shebang. Local commands are read-only; `.pi` import is read-only; durable
  commands fail closed with exit 69 before SDK initialization or source loading.
- No daemon, reducer, queue, retry authority, monitor, tmux transport, database,
  or local run-state substitute was added.

The resolved Nx graph has exactly one new production edge:
`codex-workflows -> workflows`. Both library projects have no workspace
production dependency, the CLI has no edge to `codex`, and no package points to
an application.

## Grounding and tool boundaries

The Wiki index reported healthy/fresh with 34 notes. The campaign read
`codex/orchestration/SPEC.md` and linked BATDD, GHERKIN, TESTING, AUDIT,
ORCHESTRATION, and ROLES doctrine read-only. The repository BATDD worker
contract/profile and `TESTING.md` were also loaded before test mutation.

The named `data-substrate` skill and its scratchpad initializer were not present
in either configured global skill root. No substitute database or credential
path was invented. Durable state for this report is therefore the repository
artifacts and machine test output only.

Current primary-source reconciliation used the official
[Codex SDK documentation](https://developers.openai.com/codex/sdk/),
[TypeScript SDK README](https://github.com/openai/codex/blob/main/sdk/typescript/README.md),
[Codex client source](https://github.com/openai/codex/blob/main/sdk/typescript/src/codex.ts),
and [CLI execution source](https://github.com/openai/codex/blob/main/sdk/typescript/src/exec.ts).
Installed facts were Nx 23.1.0, Bun 1.3.14, TypeScript 6.0.3, Node 24.15.0,
system Codex CLI 0.146.1, and package-pinned SDK/runtime 0.147.0. The SDK's
documented Node floor is 18.

## Scaffold and dependency evidence

The selected Nx generator implementations and schemas were inspected before
dry-run and generation. Executed generators:

```text
bun nx g @nx/js:library packages/workflows --name=workflows --bundler=none --unitTestRunner=none --linter=eslint --minimal --useProjectJson --tags=scope:workflows,type:library
bun nx g @nx/js:library packages/codex --name=codex --bundler=none --unitTestRunner=none --linter=eslint --minimal --useProjectJson --tags=scope:codex,type:library
bun nx g @nx/node:application apps/codex-workflows --name=codex-workflows --framework=none --bundler=esbuild --unitTestRunner=none --e2eTestRunner=none --linter=eslint --useProjectJson --tags=scope:workflows,type:application
```

Dependencies were installed through Bun at their owning workspace package:

```text
@orchestration/workflows -> ajv 8.20.0
@orchestration/codex -> @openai/codex-sdk 0.147.0 (exact)
@orchestration/codex-workflows -> @orchestration/workflows workspace:*
```

Consumer-local symlinks resolve to the intended package roots. No tsconfig path
alias was introduced to mask package linkage.

## Contract freeze and meaningful RED

The first frozen content digest was
`sha256:a4c44d308a6729f0a1fc3602166a3863c2de700aa700e0d31923bca945973f58`.
An exact Nx/Prettier allowlist later changed whitespace only. The successor
digest is
`sha256:98c570252a6a3159f1fbd492399ccebd4876787207426b9aba669ba03f85076f`.
No scenario text, native title, assertion, expected value, negative guarantee,
target, or cleanup obligation changed.

Every RED used a compiling/importable scaffold and selected nonzero tests:

| Contract row               | Exact Nx RED target                                                                 | Decisive failure                                                                                                                                                                  |
| -------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WF-L1-001`, `WF-L1-002`   | `bun nx run workflows:test-l1-unit --outputStyle=static`                            | 10 selected, 10 failed on `NOT_IMPLEMENTED` or missing exact issue codes.                                                                                                         |
| `WF-L1-003`                | `bun nx run workflows:test-l1-integration --outputStyle=static`                     | 3 selected, 3 failed after entering normalization/planning.                                                                                                                       |
| `CDX-L1-001`               | `bun nx run codex:test-l1-unit --outputStyle=static`                                | 4 selected, 4 failed on identity reuse, conflict, drain, and guarded reset semantics.                                                                                             |
| `CDX-L1-002`               | `bun nx run codex:test-l1-integration --outputStyle=static`                         | 4 selected; buffered result and serialization failed through a working fake adapter.                                                                                              |
| `CDX-L2-001`               | `bun nx run codex:test-l2-integration --outputStyle=static --skipNxCache`           | 4 selected; the real SDK spawned the controlled executable, then 3 semantic assertions failed on the scaffold facade. The executable probe passed, proving the boundary was live. |
| `CLI-L1-001`               | `bun nx run codex-workflows:test-l1-unit --outputStyle=static`                      | 6 selected, 6 failed on parser and exit mapping behavior.                                                                                                                         |
| `CLI-L2-003`               | `bun nx run codex-workflows:test-l2-integration --outputStyle=static --skipNxCache` | 2 selected, 2 failed with scaffold exit 70 instead of import/rejection semantics.                                                                                                 |
| `CLI-L2-001`, `CLI-L2-002` | `bun nx run codex-workflows:test-l2-e2e --outputStyle=static --skipNxCache`         | 2 selected, 2 failed with exits `[70,70,70,70]` and 70 instead of 0/69.                                                                                                           |
| `CLI-L3-001..003`          | `bun nx run codex-workflows:test-l3 --outputStyle=static --skipNxCache`             | 3 physical scenarios selected; all 3 failed their intended observable assertions against the built scaffold.                                                                      |

The controlled abort harness initially exposed an unsettled top-level-await
fixture defect. That harness defect was corrected before contract freeze; the
accepted RED had no unhandled rejection and failed only the intended facade
metric/behavior.

## Initial GREEN evidence

The three uncached aggregate targets produced these machine results:

| Project                          |   L1 unit |     L1 integration |   L2 integration |               L2 E2E |                            L3 |
| -------------------------------- | --------: | -----------------: | ---------------: | -------------------: | ----------------------------: |
| `@orchestration/workflows`       | 10 passed |           3 passed | N/A pure package |                  N/A |                           N/A |
| `@orchestration/codex`           |  4 passed |           4 passed |         4 passed | N/A library boundary |                           N/A |
| `@orchestration/codex-workflows` |  6 passed | N/A parser is pure |         2 passed |             2 passed | 3 scenarios / 13 steps passed |

Machine artifacts:

- `test-output/codex-workflows/workflows.json`
- `test-output/codex-workflows/codex.json`
- `test-output/codex-workflows/codex-workflows.json`
- `test-output/cucumber/codex-workflows.json`

Additional gates:

```text
bun nx run testing:test-policy --outputStyle=static --skipNxCache
  selected=14, status=passed

bun nx run codex:test-sdk-imports --outputStyle=static --skipNxCache
  selected=1, allowed=packages/codex/src/runtime/adapter.ts, status=passed

bun nx sync:check --outputStyle=static
  workspace up to date

bun nx format:check --projects=workflows,codex,codex-workflows,@orchestration/testing
  passed after an exact-file mechanical format pass
```

The first full affected run correctly selected all six projects because the
root lock/config changed. It exposed five stale pre-existing Ground-0 expected
closures that still named the old three-project graph. The exact L2 RED returned
six projects. The bounded update added `workflows`, `codex`, and
`codex-workflows` to only the shared-config/lockfile/SQL/migration/protocol
expectations. `@orchestration/testing:test-l2-integration` then passed 20
selected tests.

The repaired explicit affected closure passed uncached:

```text
bun nx affected -t lint,typecheck,build,test \
  --files=bun.lock,tsconfig.json,apps/codex-workflows/src/main.ts,packages/workflows/src/index.ts,packages/codex/src/index.ts,packages/testing/src/ground-zero/harness.spec.ts \
  --outputStyle=static --skipNxCache --parallel=3
```

Nx selected all 6 projects plus 2 dependency tasks. Lint, typecheck, applicable
builds, all six project aggregates, test policy, SDK import exclusivity, the
existing daemon boundary, and both Cucumber suites passed.

## Dogfood and cleanup

The built `apps/codex-workflows/dist/main.js` begins with exactly one Node
shebang, has executable mode, runs directly, and reports the documented help.
The canonical validate/inspect/plan/dry-run commands share definition digest
`sha256:fdc34332585f8d3ca5ebc768b2dd090997c4897bcf9ba89d2cccc190ad3bb884`.
The event JSONL import source digest is
`sha256:b286b4a30a1fecd9181b2931404b2995a0eb3dbd4862f75f82a17e38a439e300`.

Before/after the final affected gate:

- `.pi/goals/goal_events.jsonl` remained
  `b286b4a30a1fecd9181b2931404b2995a0eb3dbd4862f75f82a17e38a439e300`;
- the observed goal-v3 note remained
  `1a1fac4047a1795f706cf2eab13030e322f54d959f560ca20e3446b620d49b64`;
- the controlled Codex process count returned to zero;
- no `tmp/**/codex-workflows*` workspace residue remained;
- source/input immutability and OS-temporary cleanup also passed inside L2/L3
  `finally`-guarded assertions.

The pre-existing ignored `tmp/@orchestration/daemon/main-with-require-overrides.js`
was observed and left untouched. The pre-existing untracked `.pi/` tree and
architecture report were preserved.

## Deliberate limitations

- Durable workflow execution remains unavailable by architecture; exit 69 is
  the implemented safe behavior until an accepted control-plane protocol exists.
- The SDK boundary test uses the real installed SDK with a controlled local
  executable. It does not make a paid/networked OpenAI request or create a real
  Codex session.
- The system Codex CLI is 0.146.1 while this package intentionally owns SDK and
  bundled runtime 0.147.0; they are not claimed equivalent.
- No PostgreSQL process control plane, pg-boss delivery, monitor, or tmux
  transport source exists in this candidate, and none was invented.
- This implementation report is a self-authored evidence projection, not an
  independent Preflight proof, Judge verdict, or acceptance gavel.

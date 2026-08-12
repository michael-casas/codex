# Codex Workflows external audit — Attempt 2

Date: 2026-08-08  
Auditor role: fresh independent external auditor  
Workspace: `/Users/mcasa_atlantis/.codex/orchestration`

## Executive verdict

The repaired candidate is **not ready for a responsible commit**. The actual
standing targets, aggregates, public CLI, import boundary, planner
immutability, pointer admission, loader limits, cleanup, and global workflows
skill all passed fresh verification. However, three product/evidence defects
still require repair, and canonical acceptance authority is still absent:

1. the Codex singleton silently reuses an old host when API credentials,
   arbitrary nested SDK config, environment values, or the environment key set
   change under the same public fingerprint;
2. the new standing-target policy accepts both a provably unmatched Vitest
   include and `passWithNoTests: true`;
3. the aggregate collector rewrites a real zero selection to `selected: 1` in
   its machine artifact; and
4. the recovery re-proof is not reducer-registered immutable Preflight proof.

The first defect is the unresolved substance of `CWF-AUD-001`. The second and
third supersede the policy-enforcement portion of `CWF-AUD-003`. The fourth
does not invalidate the re-proof as present-day recovery input for this audit,
but it does block canonical acceptance or commit authority.

Raw rubric arithmetic is `0 + 0 + 0 + 0 + 0 = 0`. The critical
security/authority and fabricated-count caps would independently cap the score
at 3/5, but do not reduce the already lower raw score.

## Independence and authority

I am neither the implementer, the Attempt 1 auditor, nor the Repair Attempt 1
Worker. I did not inherit the Worker's conclusions. I independently read the
candidate, recomputed the evidence, reran the gates, and attacked every prior
finding.

I followed the repository `AGENTS.md`, root `README.md`, and
`packages/testing/README.md`; invoked the required `agent-wiki`, `batdd`,
`workflows`, `nx-monorepo`, `nx-workspace`, and `nx-run-tasks` skills; and read
their required references. The requested global `data-substrate` skill was not
present in the configured skill catalog. Because this audit's only authorized
persistent write was this report, I did not create a substitute scratchpad or
durable store.

The Agent Wiki remained read-only. `wiki status --json` exited 0 and reported a
fresh 34-note index rooted at
`/Users/mcasa_atlantis/Documents/vaults/Agent Wiki`. I read
`codex/orchestration/SPEC.md` and the relevant `TESTING`, `BATDD`, `AUDIT`,
`ORCHESTRATION`, `GHERKIN`, and `ROLES` standards through the Wiki CLI.

## Candidate identity and exact dirty scope

- Branch: `development`, two commits ahead of `origin/development` at audit
  start.
- Base/HEAD: `28c4650c676644bdfac11aa25c46d5be9b15f833`.
- Dirty scope before this report: 81 paths: 8 tracked modifications and 73
  untracked paths.
- SHA-256 over the sorted SHA-256 records of all 81 dirty paths:
  `4a92d2c6db08fde0f8a0c09bc0e867e6e01eaf9b657d662de986c94f45e1552f`.
- Repair re-proof candidate scope: 76 paths after excluding `.pi/**`, the
  immutable Attempt 1 audit, the repair report, and the re-proof artifact
  itself.
- Recomputed repair candidate digest:
  `de03629021d2d82f112ea65b5d75f0a5cea20f97fff482bc968c212af3904333`,
  exactly matching the declaration.
- This Attempt 2 report was created only after identity, verification, scoring,
  and the final immutable snapshot. It is an auditor artifact, not part of the
  scored 81-path candidate.

The exact 81-path pre-report inventory was:

```text
.pi/goals/archived/goal_2026071612024695_mrn48esr-mggbiz.md
.pi/goals/goal_events.jsonl
.vscode/launch.json
ARCHITECTURE.md
PLAN.md
README.md
SPEC.md
apps/codex-workflows/CLI.md
apps/codex-workflows/eslint.config.mjs
apps/codex-workflows/examples/canonical-review.input.json
apps/codex-workflows/examples/canonical-review.workflow.json
apps/codex-workflows/package.json
apps/codex-workflows/project.json
apps/codex-workflows/src/assets/.gitkeep
apps/codex-workflows/src/cli/cli.test.ts
apps/codex-workflows/src/cli/cli.ts
apps/codex-workflows/src/main.ts
apps/codex-workflows/src/source/loader.ts
apps/codex-workflows/src/workflows/FEATURE.md
apps/codex-workflows/src/workflows/cli.spec.ts
apps/codex-workflows/src/workflows/codex-workflows.feature
apps/codex-workflows/src/workflows/index.steps.ts
apps/codex-workflows/tsconfig.app.json
apps/codex-workflows/tsconfig.json
apps/codex-workflows/tsconfig.spec.json
apps/codex-workflows/vitest.config.ts
bun.lock
docs/reports/codex-workflows-external-audit-attempt-1.md
docs/reports/codex-workflows-external-audit-handoff.md
docs/reports/codex-workflows-implementation-report.md
docs/reports/codex-workflows-reimplementation-report.md
docs/reports/codex-workflows-repair-attempt-1.md
docs/reports/codex-workflows-sdk-architecture-report.md
docs/reports/codex-workflows-self-audit-report.md
packages/codex/eslint.config.mjs
packages/codex/package.json
packages/codex/project.json
packages/codex/src/fixtures/controlled-codex.mjs
packages/codex/src/index.ts
packages/codex/src/policy/sdk-imports.test.ts
packages/codex/src/policy/sdk-imports.ts
packages/codex/src/runtime/adapter.ts
packages/codex/src/runtime/facade.test.ts
packages/codex/src/runtime/observability.test.ts
packages/codex/src/runtime/sdk.spec.ts
packages/codex/src/runtime/singleton.test.ts
packages/codex/src/runtime/singleton.ts
packages/codex/src/runtime/types.ts
packages/codex/tools/check-sdk-imports.ts
packages/codex/tsconfig.json
packages/codex/tsconfig.lib.json
packages/codex/tsconfig.spec.json
packages/codex/vitest.config.ts
packages/testing/evidence/codex-workflows-repair-attempt-1-contract.json
packages/testing/evidence/codex-workflows-repair-attempt-1-reproof.json
packages/testing/manifests/codex-workflows.json
packages/testing/manifests/codex.json
packages/testing/manifests/workflows.json
packages/testing/src/cli.ts
packages/testing/src/ground-zero/harness.spec.ts
packages/testing/src/ground-zero/harness.test.ts
packages/testing/src/lib/testing.ts
packages/workflows/SCHEMA.md
packages/workflows/eslint.config.mjs
packages/workflows/package.json
packages/workflows/project.json
packages/workflows/src/index.ts
packages/workflows/src/legacy/pi.ts
packages/workflows/src/lib/contracts.ts
packages/workflows/src/lib/fixtures.test.ts
packages/workflows/src/lib/planning.test.ts
packages/workflows/src/lib/repairs.test.ts
packages/workflows/src/normalization/canonical.ts
packages/workflows/src/normalization/normalize.ts
packages/workflows/src/planning/planner.ts
packages/workflows/src/schema/validation.ts
packages/workflows/tsconfig.json
packages/workflows/tsconfig.lib.json
packages/workflows/tsconfig.spec.json
packages/workflows/vitest.config.ts
tsconfig.json
```

Generated, ignored verification artifacts under `test-output/**`, Nx cache
state, and temporary test fixtures were consequences of verification and are
not candidate paths. No candidate path other than this report was written by
this auditor.

## Required context and contract validation

I read the complete repository `TESTING.md`,
`.agents/batdd/WORKER-CONTRACT.md`, `.agents/batdd/profile.json`, its schemas,
the terminal non-dispatchable `.agents/batdd/assignments/G0.W1.json`, root
`SPEC.md`, `ARCHITECTURE.md`, `PLAN.md`, every Codex Workflows report, all six
relevant project manifests, and both repair evidence JSON files. The BATDD
profile and terminal Ground-0 assignment both validated against their schemas
with Ajv 2020 using the repository-compatible `strictRequired: false` setting;
exit 0, 0.7 seconds total.

The current candidate is a read-only local workflow definition/planning/CLI
slice. Durable commands deliberately have no local fallback and must fail
closed at exit 69. That boundary is architecturally appropriate and passed.

## Repair evidence recomputation (`CWF-AUD-004`)

### Frozen repair contract

- Path:
  `packages/testing/evidence/codex-workflows-repair-attempt-1-contract.json`.
- File SHA-256 recomputed:
  `e49d78e4fb61ea45cc07e75a068d038198a47eed621ba1b714f77035f2b9ce2d`.
- Canonical digest of `/contract` recomputed:
  `sha256:602046d227f89f21768397535cffc616ab9db9db4fe56503ef5e6d6f8ce5a3ae`.
- Base revision and pre-repair aggregate:
  `28c4650c676644bdfac11aa25c46d5be9b15f833` and
  `e2d7cba72fb07323850a15e8c47f33873b2aa038400c00018e1a1fb736d2022d`.

### Recovery re-proof

- Path:
  `packages/testing/evidence/codex-workflows-repair-attempt-1-reproof.json`.
- File SHA-256 recomputed:
  `4ea7b34102f7461ae5668d2a71018ffc1c1cc225952131dd270b10a727ce6d61`.
- Canonical digest after removing `/artifactDigest` recomputed:
  `sha256:c9c3a0dd9d6bdc4965ee5f537a1cb90390d4a895a7fadf7a3b04d3909c3693ed`.
- Its frozen-contract file hash, contract digest, candidate digest, path count,
  exclusion list, Attempt 1 audit hash, and both `.pi` hashes all match current
  disk.
- All six check records have integer nonzero `selected === executed`, top-level
  exit 0, recorded RED exit 1, recorded GREEN exit 0, and zero process/temp
  deltas.
- Fresh filtered GREEN reproduced 3, 1, 36, 1, 9, and 3 selected/executed for
  `CWF-AUD-001` through `006` respectively when the SDK scan occurrence is
  included with `005`.

The JSON is internally content-addressed and is credible **present-day
recovery evidence** for deciding what to attack. It does not reconstruct
registered historical RED. Its RED descriptions and durations remain Worker
claims. This audit did not treat them as proof.

The current source also demonstrates that the re-proof's `CWF-AUD-001`
sensitivity conclusion is semantically wrong: the frozen obligation says that
secret changes cannot bypass a host conflict, while the repaired test at
`packages/codex/src/runtime/singleton.test.ts:96` explicitly expects a host
with different API key, nested config, and environment values to be reused.
That contradiction is captured as `CWF2-AUD-001` below.

### Authority conclusion

The re-proof satisfies the explicit human-authorized recovery/re-audit **input
boundary** because its present candidate/digests/counts can be recomputed and
it makes no false claim of historical RED, verification, judgment, or
acceptance. It does **not** satisfy the canonical Preflight/acceptance boundary:
it is a mutable working-tree file, was authored by the repair Worker, has no
immutable artifact registration, and has no reducer-approved Preflight
transition. The artifact says this honestly. A fresh registered Preflight over
the eventual repaired candidate remains mandatory; see `CWF2-AUD-004`.

## Fresh command and machine-artifact ledger

All Nx verification below used the repository-required `bun nx` entrypoint.
`--skip-nx-cache` was used on targeted, standing, and affected execution. Wall
times are direct command wall times; the affected row also includes Nx's own
reported duration.

| Command / probe                                                                                                     |           Exit |               Wall |                    Selected / executed | Direct artifact or result                                 |
| ------------------------------------------------------------------------------------------------------------------- | -------------: | -----------------: | -------------------------------------: | --------------------------------------------------------- |
| `bun nx run codex:test-l1 --skip-nx-cache --outputStyle=static`                                                     |              0 |             0.899s |                                21 / 21 | Four exact L1 files; Nx cache skipped                     |
| `bun nx run codex:test-l2 --skip-nx-cache --outputStyle=static`                                                     |              0 |             0.815s |                                  5 / 5 | `sdk.spec.ts`; Nx cache skipped                           |
| `bun nx run codex-workflows:test-l1 --skip-nx-cache --outputStyle=static`                                           |              0 |             0.436s |                                  6 / 6 | `cli.test.ts`; Nx cache skipped                           |
| `bun nx run codex-workflows:test-l2 --skip-nx-cache --outputStyle=static`                                           |              0 |             2.040s |                                  4 / 4 | app build plus `cli.spec.ts`; cache skipped               |
| `bun nx run @orchestration/testing:test-policy --skip-nx-cache --outputStyle=static`                                |              0 |             0.209s |        17 / 17 policy files; 7 targets | JSON stdout; false-green attacks below                    |
| `bun nx run codex:test-sdk-imports --skip-nx-cache --outputStyle=static`                                            |              0 |             0.209s |                49 files / 1 occurrence | one allowed occurrence, zero offenders                    |
| `bun nx run @orchestration/testing:test-l2-integration --command="...CWF-AUD-004..." --skip-nx-cache`               |              0 |             0.383s |                                  1 / 1 | filtered recovery test                                    |
| filtered `CWF-AUD-001` L1                                                                                           |              0 |             1.190s |                                  2 / 2 | singleton repair tests                                    |
| filtered `CWF-AUD-001` L2                                                                                           |              0 |             1.294s |                                  1 / 1 | real controlled child                                     |
| filtered `CWF-AUD-002`                                                                                              |              0 |             1.261s |                                  1 / 1 | planner immutability                                      |
| filtered `CWF-AUD-005`                                                                                              |              0 |             1.260s |                                  8 / 8 | syntax-aware import fixtures                              |
| filtered `CWF-AUD-006`                                                                                              |              0 |             1.217s |                                  3 / 3 | malformed pointer fixtures                                |
| `git ... \| bun nx affected -t lint,typecheck,build,test --stdin --parallel=1 --skip-nx-cache --outputStyle=static` |              0 | 17.636s (Nx 17.1s) | six projects plus two dependency tasks | all lint/typecheck/build/test tasks green                 |
| `bun nx sync:check --outputStyle=static`                                                                            |              0 |             0.542s |                                    N/A | workspace up to date                                      |
| 23-path bounded repair `bun nx format:check --stdin`                                                                |              0 |             0.471s |                               23 paths | validates the re-proof's bounded-format field             |
| full 79-path non-`.pi` candidate `bun nx format:check --stdin`                                                      |              1 |             0.766s |                               79 paths | `docs/reports/codex-workflows-sdk-architecture-report.md` |
| workflows skill `quick_validate.py`                                                                                 |              0 |             <0.01s |                       five skill files | `Skill is valid!`                                         |
| public built CLI dogfood (`validate`, `inspect`, `plan`, `dry-run`)                                                 |         0 each |      0.7s combined |                          four commands | stable digest; seven nodes; no writes/SDK                 |
| durable public CLI (`run`, `resume`, `status`, `events`, `logs`, `cancel`)                                          |        69 each |      0.5s combined |                           six commands | `CONTROL_PLANE_UNAVAILABLE`                               |
| loader path/type/size/UTF-8 attack                                                                                  | expected 65/66 |               0.3s |                             four cases | stable redacted CLI error documents                       |
| controlled-child resource-delta rerun                                                                               |              0 |             0.871s |                                  5 / 5 | processes/temp roots `0 -> 0`                             |

The affected command selected `workflows`, `codex`, `codex-workflows`,
`@orchestration/testing`, `@orchestration/daemon`, and
`@orchestration/daemon-e2e` because root/config/lockfile paths are dirty. The
daemon tasks were baseline closure, not evidence that the workflow slice owns
daemon behavior. All selected tasks passed; no unrelated environment failure
was hidden.

### Fresh aggregate artifacts

| Artifact                                           | Status and nonzero counts                                                |       Duration | Current SHA-256                                                    |
| -------------------------------------------------- | ------------------------------------------------------------------------ | -------------: | ------------------------------------------------------------------ |
| `test-output/codex-workflows/workflows.json`       | 13 L1 unit; 8 L1 integration                                             |          878ms | `3c5ad3b891966c3b0c705dc297f8ee5d7976c379049d968d57c23aa9fc5cbadf` |
| `test-output/codex-workflows/codex.json`           | 14 L1 unit; 7 L1 integration; 5 L2 integration                           |         1122ms | `7c74108080513be87fe9dc40973ffa45587d3b79546e0457feb14b01f3dca02b` |
| `test-output/codex-workflows/codex-workflows.json` | 6 L1; 2 L2 integration; 2 L2 E2E; 3 L3 scenarios                         |         2186ms | `c25fb5df5ef71b5e178d6f634b102ae1148b2a14c79b6b9f2b04a2e57bfb612c` |
| `test-output/ground-zero/testing.json`             | 19 L1 unit; 3 L1 integration; 21 L2 integration; 2 L2 E2E; 1 L3 scenario |         6882ms | `3511bccc128af64c7fbb08e997388f569b1606956a8ed26c1e3ebde02da260bf` |
| `test-output/cucumber/codex-workflows.json`        | 3 scenarios; 13 steps                                                    | included above | `99376cd70b0dccca796ece9440bea97938c9231fa810856c55b794e394ccb451` |
| `test-output/cucumber/ground-zero.json`            | 1 scenario; 6 steps                                                      | included above | `658ceb9d4b3de1ffa88bb04bd202c54cee6fd1fe6b3f007e48bb2f9947343bbe` |

Every applicable layer was nonzero. Layer-specific `not-applicable` entries in
the pure libraries are explicit and do not masquerade as passes.

## Public CLI, security, and cleanup dogfood

Direct execution of `node apps/codex-workflows/dist/main.js` produced:

- `validate`, `inspect`, `plan`, and `dry-run`: exit 0 with definition digest
  `sha256:fdc34332585f8d3ca5ebc768b2dd090997c4897bcf9ba89d2cccc190ad3bb884`;
- `plan` and `dry-run`: seven nodes;
- `dry-run`: `sideEffects: []`, `durableWrites: 0`, and
  `sdkInitialized: false`;
- `run`, `resume`, `status`, `events`, `logs`, and `cancel`: exit 69 with
  `CONTROL_PLANE_UNAVAILABLE` and no fallback state;
- both `.pi` inputs imported twice with identical output and 18/11 bounded
  historical claims respectively.

An outside-root symlink was rejected with `PATH_OUTSIDE_ALLOWED_ROOT`/65; a
directory with `SOURCE_NOT_REGULAR`/66; a 1,048,577-byte source with
`SOURCE_TOO_LARGE`/65; and invalid UTF-8 with `UTF8_INVALID`/65. The ephemeral
fixture root was removed.

Before and after the dedicated real-SDK rerun, controlled children, matching OS
`codex-sdk-*` temp roots, and workspace aggregate temp roots were each `0 -> 0`.
The final audit snapshot also found zero controlled children and zero matching
temp roots.

Immutable hashes remained:

- `.pi/goals/goal_events.jsonl`:
  `b286b4a30a1fecd9181b2931404b2995a0eb3dbd4862f75f82a17e38a439e300`;
- `.pi/goals/archived/goal_2026071612024695_mrn48esr-mggbiz.md`:
  `1a1fac4047a1795f706cf2eab13030e322f54d959f560ca20e3446b620d49b64`;
- Attempt 1 audit:
  `7e3f5753651b7887476dc562c453fb96ded8e9a7993f827a2f46e30828a4ed46`.

## Mandatory repair attacks and prior-finding disposition

### `CWF-AUD-001` — REMAINING

Direct recursive mutation proved that the first admitted host configuration is
copied and frozen through nested objects, arrays, array elements, and the
environment. A real controlled child used the admitted pre-mutation path and
config. Returned diagnostics and `envKeys` are frozen; `Reflect.set` returned
false. Diagnostics contain no secret values, and two fresh hosts with different
secrets have the same public non-secret fingerprint.

Private conflict authority still fails. A second initialization with the same
`codexPathOverride`/`baseUrl` but different API key, nested config, environment
keys, and environment values produced no error, reused the first host, made no
second factory call, and later ran with the old values. See
`CWF2-AUD-001`.

### `CWF-AUD-002` — CLOSED

A recursive adversarial walker visited 39 normalized-state objects (15 arrays)
and 46 plan objects (28 arrays). Every object was frozen; no `Reflect.set` or
array push succeeded. This included policy arrays, capabilities, warnings,
nodes, dependencies, condition data, fan-out data, handler requests, child
digests, and artifacts. After mutating the original source and input,
canonical bytes, definition bytes, digest, and the first plan remained stable;
a later plan was equal but non-aliased. No prompt was projected into the plan.

### `CWF-AUD-003` — SUPERSEDED

The original four zero-selection standing commands are corrected. Fresh
uncached runs executed exactly 21, 5, 6, and 4 tests and exited 0. Resolved
`codex:test-l2` and `codex-workflows:test-l2` both have `cache: false`; both
aggregate targets and app L3 are also uncached.

The policy fixture correctly rejected an unexpanded glob, one explicit file
omission, and a wrong executor. It incorrectly accepted a Vitest config whose
only include was `src/does-not-exist/**/*.test.ts` and separately accepted a
config containing `passWithNoTests: true`. The aggregate collector also changed
a corrected zero-selection probe to `selected: 1`. These remaining parts are
superseded by `CWF2-AUD-002` and `CWF2-AUD-003`.

### `CWF-AUD-004` — SUPERSEDED

The prior absence of a bounded recovery artifact is repaired: all declared
digests, hashes, counts, exits, scope, and zero cleanup deltas recompute. The
artifact is valid for present-day recovery/re-audit and explicitly disclaims
historical RED and acceptance.

It is not immutable registered evidence and not reducer-approved Preflight.
That canonical authority blocker is precisely restated as `CWF2-AUD-004`; it
must be satisfied over the eventual post-repair candidate, not retroactively
claimed for this one.

### `CWF-AUD-005` — CLOSED

The syntax-aware scanner detected static value imports, `import type`, inline
type specifiers, side-effect imports, value/type/star re-exports, dynamic
string/template imports, CommonJS `require`, and TypeScript import-equals.
Comments and ordinary strings produced zero occurrences. Exactly-one passed;
missing, duplicate, and external-offender layouts failed with actual
occurrence/file/line/column reporting. The real scan selected 49 source files,
found exactly the value import at
`packages/codex/src/runtime/adapter.ts:1`, and found zero offenders.

The inline `import { type X }` occurrence is labeled `static-value-import`
rather than `static-type-import`, but it is counted and enforced. This naming
detail is not material to exclusivity.

### `CWF-AUD-006` — CLOSED

Direct admission attacks rejected bare `~`, `~2`, trailing `~`, invalid nested
escapes, empty segments, relative pointers, and decoded `__proto__`,
`constructor`, and `prototype` segments. Malformed condition, fan-out source,
and item-key fixtures all emitted `UNSAFE_JSON_POINTER`. Valid `/a~0b`,
`/a~1b`, `/items~1nested`, `/id~0key`, and the RFC-correct `/~01` were admitted.

### `CWF-AUD-007` — REMAINING (non-material)

The 23 exact Repair Attempt 1 paths pass `format:check`, so the repair
re-proof's narrowly worded format field is accurate. The complete non-`.pi`
candidate still fails format check only on
`docs/reports/codex-workflows-sdk-architecture-report.md`. This is the same
low-severity candidate-hygiene finding, not a behavioral or environment
failure.

### `CWF-AUD-008` — REMAINING (non-material)

At `apps/codex-workflows/src/workflows/cli.spec.ts:15`, the
`REAL-BOUNDARY INTEGRATION TESTS` heading precedes the `[L2:E2E]` suite. At line
116, the `END-TO-END TESTS` heading precedes the `[L2:INTEGRATION]` suite. The
aggregate uses the suite labels and still executes 2/2 in each owned L2
sub-layer, so this is documentation/classification clarity rather than a false
green.

## Adversarial and false-green attacks

| Attack                                                                                         | Result                                     | Interpretation                       |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------ |
| Mutate original/nested singleton config, arrays, environment, and API key after initialization | admitted snapshot and real child stable    | copy/freeze portion holds            |
| Mutate returned diagnostics and `envKeys`                                                      | `Reflect.set === false`                    | diagnostic authority is immutable    |
| Reinitialize with different secrets/config/env under same public fingerprint                   | old host silently reused                   | material private conflict bypass     |
| Recursively mutate every normalized/plan projection                                            | 85 objects visited; zero writes/pushes     | planner repair holds                 |
| Standing target positional `**` glob                                                           | policy violation                           | expected fail-closed                 |
| Standing target explicit omission                                                              | policy violation                           | expected fail-closed                 |
| Standing target wrong runner                                                                   | policy violation                           | expected fail-closed                 |
| Config include matching no test file                                                           | policy reports zero violations             | material policy false green          |
| Config with `passWithNoTests: true`                                                            | policy reports zero violations             | material policy false green          |
| Valid aggregate child emitting `Tests 0 passed`, exit 0                                        | aggregate exits 1 but writes `selected: 1` | material machine-count falsification |
| Static/type/side-effect/re-export/dynamic/require SDK forms                                    | all detected                               | import repair holds                  |
| SDK package names in comments/strings                                                          | zero occurrences                           | no lexical false positive            |
| Malformed and pollution-pointer matrix                                                         | invalid denied; valid escapes admitted     | pointer repair holds                 |
| Outside symlink, directory, oversized source, invalid UTF-8                                    | stable exits 65/66                         | loader fails closed                  |
| All durable CLI verbs                                                                          | exit 69, no fallback                       | durable authority fails closed       |

The first zero-artifact probe had an incorrectly escaped `node -e` fixture and
failed with a JavaScript syntax error. Per audit law, that broken harness was
discarded and was not treated as behavioral evidence. The corrected fixture
printed a valid `Tests 0 passed`, exited 0, was parsed by the collector, and
reproduced the `selected: 1` artifact defect. Its temporary directory was
removed.

## New Attempt 2 findings

### `CWF2-AUD-001` — CRITICAL — Material

**Evidence.** `packages/codex/src/runtime/singleton.ts:82-92` creates both the
diagnostic and private authority fingerprint from only `codexPathOverride` and
`baseUrl`. `RuntimeHost.admits` at lines 162-164 compares only that value, and
`initializeCodexHost` at lines 391-398 returns the singleton whenever it
matches. The repaired test at
`packages/codex/src/runtime/singleton.test.ts:96-111` supplies a different API
key, arbitrary nested config, environment key/value set, and explicitly
expects the original host.

The independent runtime probe observed one factory call, no conflict, the same
host handle, and later behavior still bound to the first API key/config/env.
Public diagnostics stayed secret-independent, which is correct; the missing
piece is a private full-admission conflict check.

**Impact.** A caller can request a host under different credentials,
environment authority, or SDK overrides and be silently given an already
initialized host with old values. This is a credential/configuration authority
confusion and directly violates the frozen repair obligation that secret
changes cannot bypass a host conflict. It is also acceptance weakening: the
new test encodes reuse where the contract requires conflict.

**Bounded repair acceptance.** Keep public diagnostics and their fingerprint
secret-free. Separately retain a private immutable admission comparator or
commitment covering every behavior-affecting host field, including API key,
nested config, environment keys/values, and observer identity. A second
initialization must reuse only an equivalent admitted configuration and throw
`CODEX_HOST_CONFLICT` for a difference without logging or exposing the values.
Fresh L1 must attack each field independently and in combination; real L2 must
prove the old child cannot be silently returned for a conflicting request.
Original caller mutation, copy/freeze, diagnostic mutation, and secret
non-disclosure guarantees must remain locked.

### `CWF2-AUD-002` — HIGH — Material

**Evidence.** `packages/testing/src/lib/testing.ts:167-180` treats a config-only
selection as proven when the config source merely contains the required suffix
string and omits the other suffix. It neither resolves the include against the
known layer files nor rejects `passWithNoTests`. Independent fixtures with
`include: ['src/does-not-exist/**/*.test.ts']` and with
`passWithNoTests: true` each returned `configured: 2, violations: []`.

**Impact.** The guard added for `CWF-AUD-003` can certify a future standing
target that selects zero files and can be configured to exit successfully.
The current four target commands are exact and genuinely nonzero, so this is
not misreported as a current live-gate failure. It is nevertheless a material
failure of the frozen policy-enforcement obligation and a future false-green
path.

**Bounded repair acceptance.** Prefer an explicit exhaustive file list, as the
current four targets already use. If config-only targets remain supported, the
policy must parse/resolve their actual include/exclude behavior against the
known project file set and must reject command- or config-level
`passWithNoTests`. Fixtures must prove rejection of invalid glob, omission,
wrong runner, unmatched include, cross-layer include, and permissive zero-test
settings, while accepting an exact exhaustive target.

### `CWF2-AUD-003` — HIGH — Material

**Evidence.** `packages/testing/src/cli.ts:107-126` correctly changes a
zero-selection child with exit 0 to exit 1, then serializes
`selected: Math.max(selected, 1)`. With a valid child command that printed
`Tests 0 passed` and exited 0, the aggregate exited 1 but its machine artifact
reported `selected: 1`.

**Impact.** The status fails closed, so this probe does not itself yield an
accepted green. The machine evidence still contains a fabricated nonzero test
count, violating the requirement that artifacts preserve actual selection and
triggering the rubric's fabricated/zero-test evidence cap. It can mislead
recovery evidence and audit tooling that independently consumes counts.

**Bounded repair acceptance.** Preserve the actual `selected: 0` in the failed
child artifact while retaining nonzero enforcement and aggregate exit 1. Add a
machine-artifact assertion for zero selection, malformed collector output, and
nonzero selection. If an executed count is separately claimed, serialize the
actual executed value rather than deriving or clamping it.

### `CWF2-AUD-004` — HIGH — Material authority blocker

**Evidence.** The re-proof's own authority and limitation fields state that no
immutable registration, Preflight approval, reducer approval, verification,
judgment, or acceptance is claimed. No authoritative process control plane or
compiled repair envelope exists in the candidate. The artifact is an
untracked, mutable working-tree file authored by the Repair Worker.

**Impact.** Content addressing plus this independent recomputation is enough
to use the artifact as present-day recovery input, but not enough for canonical
acceptance. Even a behaviorally clean candidate would still lack the fresh,
exact-candidate, reducer-approved Preflight evidence required before a
responsible commit under the governing orchestration specification.

**Bounded acceptance.** After `CWF2-AUD-001` through `003` are repaired and the
candidate identity changes, a fresh independent Preflight identity must run
the selected uncached gates, register immutable machine artifacts and cleanup
deltas over that exact candidate through the scoped control plane, and obtain
the reducer-approved state transition. Do not relabel the current recovery
JSON as historical RED or Preflight.

## Material blockers and non-material follow-ups

Material blockers before commit:

- `CWF2-AUD-001`: private singleton credential/config conflict bypass and
  acceptance weakening;
- `CWF2-AUD-002`: standing-target policy admits zero-selection/permissive
  configurations;
- `CWF2-AUD-003`: aggregate machine artifacts clamp actual zero to one; and
- `CWF2-AUD-004`: no reducer-approved immutable Preflight over the exact final
  candidate.

Non-material follow-ups:

- format `docs/reports/codex-workflows-sdk-architecture-report.md` so the full
  candidate passes format check (`CWF-AUD-007`);
- align the two L2 headings with their suite labels (`CWF-AUD-008`); and
- optionally classify inline `import { type X }` as a type occurrence in SDK
  import diagnostics. Enforcement already counts it.

## Rubric

### 1. Contract and architecture fidelity

POINT: 0

The workflow/planner boundary, SDK import exclusivity, and fail-closed durable
CLI architecture are sound. The singleton does not enforce the frozen private
host-conflict contract for credentials/config/env, and the repaired test
weakens that acceptance. Canonical immutable/reducer authority is also absent.
The axis therefore does not wholly hold.

### 2. Behavior and BATDD evidence

POINT: 0

Fresh L1/L2/L3, standing targets, aggregates, and affected closure are nonzero
and green. The recovery JSON is a credible current re-proof, not historical
RED. However, its `CWF-AUD-001` GREEN semantics contradict the frozen
obligation; the standing-target guard has a zero-selection false green; and the
collector fabricates a nonzero count in the zero case. The axis explicitly
requires no false greens.

### 3. Security, authorization, and recovery

POINT: 0

Path admission, byte/schema/fan-out limits, pointer denial, SDK snapshot
immutability, cancellation/reaping, redaction, `.pi` immutability, cleanup, and
durable exit-69 semantics passed. Silent credential/config/env conflict reuse
is a critical authority defect, and registered recovery/Preflight authority is
missing. The complete axis does not hold.

### 4. Implementation and integration quality

POINT: 0

Public CLI/package APIs, planner determinism, SDK import policy, Nx graph,
typing, lint, build, and sync are otherwise strong. The production singleton
admission error, static policy false green, and dishonest zero-count artifact
are material implementation defects requiring code/test repair. The bounded
slice is not production-quality yet.

### 5. Documentation, operability, and skill quality

POINT: 0

CLI/schema/examples and the global workflows skill are accurate; the skill
validated and its five hashes were independently inspected. The repair report
and recovery JSON nevertheless claim semantic closure of `CWF-AUD-001` and the
policy obligation when current source/probes disprove them. Full-candidate
formatting and the reversed L2 headings also remain. Documentation/evidence do
not fully reconcile with current behavior.

## Arithmetic, caps, and recommendation

- Axis 1: 0
- Axis 2: 0
- Axis 3: 0
- Axis 4: 0
- Axis 5: 0
- Raw score: `0/5`
- Applicable cap: at most `3/5` due to critical security/authority violation,
  acceptance weakening, fabricated zero-selection count, and material product
  repair.
- Final score after cap: `0/5`.

Recommendation: **repair required; do not commit this candidate**. Repair only
the bounded findings above, preserve the closed immutability/import/pointer and
live-gate behavior, regenerate honest recovery evidence for the new exact
candidate, obtain fresh registered Preflight proof, and then conduct a fresh
independent judgment.

FINAL_SCORE: 0/5
VERDICT: REPAIR_REQUIRED

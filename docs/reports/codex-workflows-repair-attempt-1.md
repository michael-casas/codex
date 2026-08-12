# Codex Workflows Bounded Repair — Attempt 1

**Campaign:** `CDX-WF-2026-08-07`  
**Repair authority:** human-issued failed-only serialized repair charter for
`CWF-AUD-001` through `CWF-AUD-006`  
**Role boundary:** repair Worker evidence only; no verification, judgment,
acceptance, or score  
**Independent audit preserved:**
`docs/reports/codex-workflows-external-audit-attempt-1.md`

> **Attempt 2 reconciliation (2026-08-08):** The independent
> `codex-workflows-external-audit-attempt-2.md` found that this repair's
> current-candidate closure claims were incomplete. In particular, its
> `CWF-AUD-001` account covered only public path/base identity and encoded
> credential/config/environment reuse, its standing-target policy did not
> prove config discovery or reject permissive zero-test settings, and its
> collector clamped actual zero selection to one. Those three product defects
> are superseded by `codex-workflows-repair-attempt-2.md`. This Attempt 1 report
> remains historical Worker evidence, not Preflight or acceptance.

## Repair outcome

The six material Attempt 1 findings have bounded implementation repairs,
nonzero RED and GREEN command evidence, content-addressed present-day recovery
re-proof, and passing required gates. The audit report and its score remain
unchanged. This report stops at the fresh re-audit boundary.

No feature, durable authority, daemon surface, control-plane substitute,
database, queue, retry mechanism, monitor, transport, or `.pi` mutation was
added. No commit, stage, push, merge, publish, deploy, worktree cleanup, Agent
Wiki mutation, or unrelated-state cleanup occurred.

## Candidate identities and frozen contract

- Repository base revision:
  `28c4650c676644bdfac11aa25c46d5be9b15f833`.
- Pre-repair candidate: 70 sorted dirty candidate paths, aggregate SHA-256
  `e2d7cba72fb07323850a15e8c47f33873b2aa038400c00018e1a1fb736d2022d`.
  This reproduces the independent auditor's identity by excluding `.pi/**`
  and the audit report, hashing every remaining tracked-modified/untracked
  file, sorting the hash records, and hashing those bytes.
- Post-repair candidate: 76 sorted paths, aggregate SHA-256
  `de03629021d2d82f112ea65b5d75f0a5cea20f97fff482bc968c212af3904333`. The same algorithm excludes `.pi/**`, the
  immutable Attempt 1 audit, the self-referential repair report, and the
  self-referential recovery/re-proof artifact. The exact rule and exclusions
  are embedded in the re-proof artifact.
- Frozen additive contract: `CDX-WF-AUD1-REPAIR-GC1`, semantic digest
  `sha256:602046d227f89f21768397535cffc616ab9db9db4fe56503ef5e6d6f8ce5a3ae`.
  Contract file SHA-256:
  `e49d78e4fb61ea45cc07e75a068d038198a47eed621ba1b714f77035f2b9ce2d`.
- A pre-implementation draft digest
  `sha256:3a340b29bf3b681e84ac18e7f24a0ef712ab7d55b2a5ca9e522f72289228fc38`
  is preserved as superseded. Before GREEN implementation, it was corrected
  because it mistakenly excluded environment key names despite locked
  acceptance requiring deeply immutable, copy-safe `envKeys`. No secret or
  environment value was admitted into identity or diagnostics.

Contract artifact:
`packages/testing/evidence/codex-workflows-repair-attempt-1-contract.json`.

## RED and GREEN evidence by finding

The rejected attempt to append a second `--testNamePattern` option is excluded:
Vitest rejected that invocation as a broken harness, so it is not RED evidence.
Every command below was Nx-backed, uncached, selected nonzero behavior, and
failed or passed for the stated semantic reason.

### CWF-AUD-001 — immutable SDK host authority

RED:

- `codex:test-l1-unit` with the exact `CWF-AUD-001` filter selected/executed 2,
  exit 1, 0.82s. The adapter factory received the caller object and diagnostics
  were mutable.
- `codex:test-l2-integration` with the exact `CWF-AUD-001` filter
  selected/executed 1, exit 1, 0.87s. The real SDK child did not use the
  admitted trace/config after caller mutation.

GREEN:

- The same commands selected/executed 2 and 1, exits 0, in 0.70s and 0.64s.
- `codex:test-l2` subsequently selected/executed 5/5 through the real SDK and
  controlled child.
- Host config is cloned and deeply frozen before fingerprinting and adapter
  construction. Private host state owns the authoritative fingerprint.
  Diagnostics are deeply immutable; `codexPathOverride` and `baseUrl` are the
  only explicit identity fields. API keys, environment values, and arbitrary
  config names/values cannot change identity or appear in diagnostics. The
  locked sorted `envKeys` projection remains copy-safe and is excluded from
  identity.

### CWF-AUD-002 — plan/digest integrity

RED:

- `workflows:test-l1-integration` with the exact `CWF-AUD-002` filter
  selected/executed 1, exit 1, 0.77s. `Reflect.set` changed returned plan
  policy, proving mutable aliasing into digest-bound state.

GREEN:

- The same command selected/executed 1, exit 0, 0.69s.
- Normalized definitions, nested workflow/policy/capability state, and every
  returned plan projection are recursively frozen. Plan policy and required
  capabilities are cloned, eliminating references shared with normalized
  canonical state. Mutation attempts across policy, nodes, capabilities,
  fan-out requests, joins, artifacts, dependencies, and warnings leave the
  canonical bytes, digest, first plan, and second plan unchanged.

### CWF-AUD-003 — nonzero standing Nx targets

RED:

- `@orchestration/testing:test-policy` evaluated the four affected standing
  targets, exit 1, 0.44s, and emitted `INVALID_STANDING_TARGET_FILTER` for each
  unexpanded positional glob. The dedicated policy fixture selected/executed
  1/1 and proved both glob and file-omission rejection.

GREEN:

- `codex:test-l1`: 21/21, exit 0.
- `codex:test-l2`: 5/5, exit 0, cache disabled.
- `codex-workflows:test-l1`: 6/6, exit 0.
- `codex-workflows:test-l2`: 4/4, exit 0, cache disabled.
- The final serialized four-target run, including the app build dependency,
  completed in 3.1s uncached.
- Testing policy selected 17 policy files, inspected 7 standing targets, and
  exited 0. It rejects glob-based zero-selection risk, invalid runners,
  omitted layer files, unproven exclusive selection, missing layer targets,
  and cached live L2 targets.

### CWF-AUD-004 — legitimate recovery re-proof

RED:

- `@orchestration/testing:test-l2-integration` with the exact `CWF-AUD-004`
  filter selected/executed 1, exit 1, 0.68s because the required recovery
  artifact was absent.

GREEN:

- The same executable policy selected/executed 1, exit 0, 0.56s after the
  machine artifact was created; it passed again against the final artifact.
- Recovery/re-proof artifact internal digest:
  `sha256:c9c3a0dd9d6bdc4965ee5f537a1cb90390d4a895a7fadf7a3b04d3909c3693ed`.
- Recovery/re-proof file SHA-256:
  `4ea7b34102f7461ae5668d2a71018ffc1c1cc225952131dd270b10a727ce6d61`.
- Path:
  `packages/testing/evidence/codex-workflows-repair-attempt-1-reproof.json`.

The artifact binds the exact frozen contract, candidates, commands, nonzero
counts, exits, durations, decisive semantic failures/sensitivity, zero cleanup
deltas, and immutable audit/`.pi` hashes. It explicitly states
`recovery-evidence-not-historical-red-proof` and makes no registration,
Preflight, verification, judgment, acceptance, or score claim.

The repository has no repair registration control plane or compiled repair
envelope mechanism for this wave. Canonical Wiki/repository law was read
read-only; the human charter supplies the repair role, attempt, findings, write
surface, and stop boundary. No terminal prior assignment was altered and no
fake durable registration was fabricated. Consequently, the missing original
registered historical RED remains unrecoverable and is reported as a
limitation, while the authorized present-day recovery procedure is directly
executable and content-addressed.

### CWF-AUD-005 — complete SDK import exclusivity

RED:

- `codex:test-l1-unit` with the exact `CWF-AUD-005` filter selected/executed
  8, exit 1, 0.64s. Four adversarial checks failed: side-effect import,
  CommonJS `require`, comment/string false positives, and forbidden
  side-effect exclusivity.

GREEN:

- The same fixture command selected/executed 8/8, exit 0, 0.61s.
- `codex:test-sdk-imports` selected the one actual SDK occurrence, exit 0,
  0.61s. Its TypeScript-AST scan reported all 49 actual scanned JavaScript/
  TypeScript files, exactly one `static-value-import` at
  `packages/codex/src/runtime/adapter.ts:1:1`, one allowed occurrence, and zero
  offenders.
- Fixtures cover static value/type/side-effect imports, re-exports, dynamic
  import, supported CommonJS require, allowed/missing/duplicate/forbidden
  layouts, comments, and ordinary strings.

### CWF-AUD-006 — RFC 6901 pointer admission

RED:

- `workflows:test-l1-unit` with the exact `CWF-AUD-006` filter
  selected/executed 3, exit 1, 0.59s. Malformed condition `/~2`, fan-out source
  trailing `~`, and item-key `/~x` pointers were admitted without
  `UNSAFE_JSON_POINTER`.

GREEN:

- The same command selected/executed 3/3, exit 0, 0.63s.
- Admission now scans each raw segment and rejects every tilde not immediately
  followed by `0` or `1` before decoding. The standing unit suite retains the
  decoded `__proto__`, `constructor`, and `prototype` denial and stable issue
  code.

## Exact repair path map

| Finding                                 | Changed paths                                                                                                                                                                                                                                  |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CWF-AUD-001`                           | `packages/codex/src/runtime/types.ts`; `packages/codex/src/runtime/singleton.ts`; `packages/codex/src/runtime/singleton.test.ts`; `packages/codex/src/runtime/sdk.spec.ts`                                                                     |
| `CWF-AUD-002`                           | `packages/workflows/src/normalization/canonical.ts`; `packages/workflows/src/normalization/normalize.ts`; `packages/workflows/src/planning/planner.ts`; `packages/workflows/src/lib/repairs.test.ts`                                           |
| `CWF-AUD-003`                           | `packages/codex/project.json`; `apps/codex-workflows/project.json`; `packages/testing/src/lib/testing.ts`; `packages/testing/src/cli.ts`; `packages/testing/src/ground-zero/harness.test.ts`                                                   |
| `CWF-AUD-004`                           | `packages/testing/src/ground-zero/harness.spec.ts`; `packages/testing/evidence/codex-workflows-repair-attempt-1-contract.json`; `packages/testing/evidence/codex-workflows-repair-attempt-1-reproof.json`; `PLAN.md`                           |
| `CWF-AUD-005`                           | `packages/codex/src/policy/sdk-imports.ts`; `packages/codex/src/policy/sdk-imports.test.ts`; `packages/codex/tools/check-sdk-imports.ts`; `packages/codex/project.json`; `packages/testing/manifests/codex.json`                               |
| `CWF-AUD-006`                           | `packages/workflows/src/schema/validation.ts`; `packages/workflows/src/lib/fixtures.test.ts`                                                                                                                                                   |
| Direct claim reconciliation for 001–006 | `docs/reports/codex-workflows-implementation-report.md`; `docs/reports/codex-workflows-reimplementation-report.md`; `docs/reports/codex-workflows-self-audit-report.md`; `docs/reports/codex-workflows-external-audit-handoff.md`; this report |

No `SPEC.md`, `ARCHITECTURE.md`, original frozen acceptance file, Attempt 1
audit, global skill, daemon product surface, or `.pi` path was modified.

## Full validation closure

The explicit uncached affected command used the 23 exact repair code,
test/config, plan, and evidence paths:

```text
bun nx affected -t lint,typecheck,build,test --files=<23 exact repair paths> --parallel=1 --skip-nx-cache --outputStyle=static
```

Nx selected `workflows`, `codex`, `codex-workflows`, and
`@orchestration/testing` plus two dependency tasks. Lint, typecheck, app build,
all four aggregates, testing policy, and SDK import policy exited 0 in 15.4s.

Final aggregate counts:

| Target                                    | Nonzero result                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------------- |
| `workflows:test`                          | 13 L1 unit + 8 L1 integration passed                                                        |
| `codex:test`                              | 14 L1 unit + 7 L1 integration + 5 real-SDK L2 integration passed                            |
| `codex-workflows:test`                    | 6 L1 unit + 2 L2 integration + 2 L2 E2E + 3 L3 scenarios/13 steps passed                    |
| `@orchestration/testing:test:ground-zero` | 19 L1 unit + 3 L1 integration + 21 L2 integration + 2 L2 E2E + 1 L3 scenario/6 steps passed |

Machine artifacts and final SHA-256 values:

- `test-output/codex-workflows/workflows.json`:
  `276d1c53551b36bd2ce77cf68e0d95bdc7cace0ffb1167dedbba82674d1de4b1`.
- `test-output/codex-workflows/codex.json`:
  `5e7e25f8cd91993280b1b7d0413cecbd71a26d7bea3400bb4d60accd9d9e2ba6`.
- `test-output/codex-workflows/codex-workflows.json`:
  `75914a0158a560f0875c785ec2225bc0b1730eb5298d089fe797e2636d79b447`.
- `test-output/ground-zero/testing.json`:
  `e233dd072c9d1e126d65963a4e4755db2001c8bea672d8b97b888ce2537519cc`.
- `test-output/cucumber/codex-workflows.json`:
  `4f158efd59c90b505de14085b9e1d97cfe7802b22b5c69ce5af797ea79a50718`.
- `test-output/cucumber/ground-zero.json`:
  `d2e66bf50af6e4790b708862c9d9ba37b8902f499ff7da6c0c6560c944b05278`.

Additional gates:

- `bun nx sync:check --outputStyle=static`: exit 0, workspace up to date.
- Exact bounded changed-file `bun nx format:check`: exit 0.
- CLI dogfood through `codex-workflows:cli` covered `validate`, `inspect`,
  `plan`, and `dry-run`, all exit 0. Definition digest remained
  `sha256:fdc34332585f8d3ca5ebc768b2dd090997c4897bcf9ba89d2cccc190ad3bb884`;
  plan size remained seven nodes; dry-run reported no side effects, no SDK
  initialization, and zero durable writes.
- Built CLI and controlled fixture remain executable (`755`).
- The global `workflows` skill and its referenced CLI contract were not
  modified; the repair changed internal immutability/admission and policy
  enforcement only, so no skill regeneration or behavior validation was
  triggered. Its CLI references were exercised by dogfood.
- Workspace package links were re-inspected and remained the intended Bun
  workspace symlinks; no relink write was required.

## Cleanup, immutable inputs, and repository state

Before and after final live validation:

- controlled `controlled-codex.mjs` children: 0 → 0;
- matching OS temp roots (`codex-sdk-*`, `codex-output-schema-*`,
  `codex-workflows-*`, `orchestration-ground-zero-*`): 0 → 0;
- workspace aggregate temp roots: 0 → 0;
- process delta: 0; temporary-path delta: 0.

Immutable hashes before and after:

- Attempt 1 audit (630 lines):
  `7e3f5753651b7887476dc562c453fb96ded8e9a7993f827a2f46e30828a4ed46`.
- `.pi/goals/goal_events.jsonl`:
  `b286b4a30a1fecd9181b2931404b2995a0eb3dbd4862f75f82a17e38a439e300`.
- `.pi/goals/archived/goal_2026071612024695_mrn48esr-mggbiz.md`:
  `1a1fac4047a1795f706cf2eab13030e322f54d959f560ca20e3446b620d49b64`.

Exact status was inspected. Pre-existing unrelated modifications/untracked
paths remain present and were neither cleaned nor attributed to this repair.

## Remaining limitations and honest blockers

- Recovery/re-proof cannot reconstruct immutable registered historical RED.
  It proves present-day sensitivity and repaired behavior only.
- No repair registration control plane, reducer-approved evidence registry,
  compiled repair envelope mechanism, or fresh Preflight identity is available
  in this candidate. This Worker did not fabricate one or alter the terminal
  `G0.W1` assignment.
- The named global `data-substrate` skill and session-scratchpad initializer
  are absent from configured skill roots. No substitute database, credential
  access, or unscoped state store was created.
- The real SDK boundary uses the pinned installed SDK with a controlled local
  executable, not a paid/networked OpenAI turn.
- This Worker is not independent and cannot verify, judge, accept, or score the
  candidate.

These are disclosed evidence/authority limitations, not hidden product-test
failures. All six chartered material repairs and required local gates have
direct evidence.

## Charter for the next fresh auditor

Use a fresh identity and context. Read the unchanged Attempt 1 audit first,
then this report and both machine artifacts. Recompute the frozen contract,
re-proof, and post-repair candidate digests using their declared scopes. Run
the four corrected standing targets uncached and attack each repaired semantic
boundary: mutate original/nested host config and diagnostics across a real
child; mutate all nested plan projections; force standing-target zero
selection; remove or alter recovery fields; inject every SDK import form plus
comment/string decoys; and exercise malformed and decoded-dangerous JSON
pointers. Confirm cleanup and immutable audit/`.pi` hashes. Treat recovery
evidence only as recovery evidence, and issue any re-audit finding or verdict
independently without inheriting this Worker's conclusions.

REPAIR_STATUS: READY_FOR_REAUDIT

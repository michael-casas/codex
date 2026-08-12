# Codex Workflows direct TypeScript runner — external audit Attempt 3

Date: 2026-08-08  
Workspace: `/Users/mcasa_atlantis/.codex/orchestration`  
Audit role: fresh independent external auditor and Wave Judge  
Candidate HEAD: `28c4650c676644bdfac11aa25c46d5be9b15f833` on `development`  
Canonical score: **1/5**

## Authority, identity, and scope

I did not implement this candidate. I inspected it without repairing, refactoring, reformatting, or modifying product code, existing tests, existing evidence, prior reports, `.pi`, configuration, lockfiles, or documentation. The only additions made by this audit are the seven user-authorized Attempt 3 L3 files, ignored generated run/test output, and this append-only report.

I read the governing repository files completely: root `AGENTS.md`, `README.md`, `SPEC.md`, `ARCHITECTURE.md`, `PLAN.md`, and `TESTING.md`; `.agents/batdd/WORKER-CONTRACT.md`; `.agents/batdd/profile.json`; resolved Nx project definitions; applicable testing manifests and evidence; the implementation report, self-audit report, external-audit handoff, Green Contract, machine reproofs, repair contracts/reproofs, both prior external-audit attempts, architecture/reimplementation reports, and current changed/untracked deliverables.

I invoked and followed the global `workflows`, `batdd`, `agent-wiki`, `nx-workspace`, and `nx-run-tasks` skills and their routed references. Through the read-only Agent Wiki workflow I read canonical `standards/AUDIT.md`, `standards/BATDD.md`, `standards/TESTING.md`, `standards/GHERKIN.md`, and `codex/orchestration/SPEC.md`. The Agent Wiki was not modified. The required global `data-substrate` skill was not present in the supplied skill catalog or filesystem at the referenced system-skill location. I did not improvise database access or create a session scratchpad because the user granted a closed additive write surface. This limits this report's ability to claim reducer-registered Preflight proof; it does not limit direct current-disk inspection or auditor-executed Nx and runtime evidence.

The governing hierarchy used for judgment was human instruction and repository law, canonical Wiki standards, executable acceptance and manifests, current source, independently reproduced runtime behavior, immutable machine artifacts, and only then implementer-authored claims.

## Baseline, inventory, and digests

At intake, Git reported eight modified tracked paths and 100 untracked paths, for 108 dirty paths. Before writing this report, Git reported the same 108 candidate paths plus exactly seven authorized Attempt 3 files, for 115 dirty paths. No baseline path was cleaned, overwritten, or removed.

The implementer-published candidate algorithm excludes `.pi/**`, `docs/reports/**`, the main self-authored reproof, and the Attempt 3 additive paths when checking the original candidate. Recomputing that algorithm over current disk produced 92 paths and:

`sha256:1d4c09fd9657bb4aa9c020b785deb6a9bfb4c097bcdffea4559000daa1c436ef`

That is byte-for-byte equal to the claimed original candidate digest before and after all auditor probes. Including the seven Attempt 3 files, while retaining the other published exclusions, produced 99 paths and:

`sha256:a0b7f39ae650d5bb338ecb96c70145a2c40dbd49c9caabe47225a6696657715b`

The full dirty-tree intake digest before Attempt 3 additions was:

`sha256:a130583fdc7174a206c759d499434218c32eeb8d42871d59b2e9cdf29d96a11e`

The important immutable-claim hashes also reconciled after all probes:

| Artifact | SHA-256 |
|---|---|
| TS runner Green Contract file | `d5e2266f7e8ceecb1a1d598ffd75dc1ff4160d5805ebec3333691d1d77e6f839` |
| TS runner main reproof | `40398729a62e3c4ce195d935e1b3e55a5a2819087804c425b123d90a885dfd20` |
| External audit Attempt 1 | `7e3f5753651b7887476dc562c453fb96ded8e9a7993f827a2f46e30828a4ed46` |
| External audit Attempt 2 | `06f41544f043f323163f086aa92ee315114df7a3613cc4e11178fed2d89aaf7e` |
| `.pi` goal event log | `b286b4a30a1fecd9181b2931404b2995a0eb3dbd4862f75f82a17e38a439e300` |
| `.pi` archived goal | `1a1fac4047a1795f706cf2eab13030e322f54d959f560ca20e3446b620d49b64` |
| Green Contract internal contract digest | `093013c0fea515676e9096692ed59f7b190456c7f9adb38c413e64c31d56eba5` |
| Prior NestJS live journal | `fd7cf74ef63ccd2cbab5f161938f6aabde621e103bc03be248ef299dacb4cd90` |
| Prior NestJS live artifact | `4ad3fb16096eaef505de1806987864d027d598a1b09df2fa53128249dede055f` |

### Complete current-disk intake before this report

Modified tracked paths:

```text
.vscode/launch.json
README.md
bun.lock
packages/testing/src/cli.ts
packages/testing/src/ground-zero/harness.spec.ts
packages/testing/src/ground-zero/harness.test.ts
packages/testing/src/lib/testing.ts
tsconfig.json
```

Untracked paths:

```text
.pi/goals/archived/goal_2026071612024695_mrn48esr-mggbiz.md
.pi/goals/goal_events.jsonl
ARCHITECTURE.md
PLAN.md
SPEC.md
apps/codex-workflows/CLI.md
apps/codex-workflows/eslint.config.mjs
apps/codex-workflows/examples/canonical-review.input.json
apps/codex-workflows/examples/canonical-review.workflow.json
apps/codex-workflows/examples/external-audit-attempt-3.input.json
apps/codex-workflows/examples/external-audit-attempt-3.workflow.ts
apps/codex-workflows/examples/nestjs-resolver-factory-research.input.json
apps/codex-workflows/examples/nestjs-resolver-factory-research.workflow.json
apps/codex-workflows/examples/nestjs-resolver-factory-research.workflow.ts
apps/codex-workflows/package.json
apps/codex-workflows/project.json
apps/codex-workflows/src/assets/.gitkeep
apps/codex-workflows/src/cli/cli.test.ts
apps/codex-workflows/src/cli/cli.ts
apps/codex-workflows/src/features/external-audit-dogfood/external-audit-dogfood.feature
apps/codex-workflows/src/features/external-audit-dogfood/index.steps.ts
apps/codex-workflows/src/features/external-audit-dogfood/support/driver.js
apps/codex-workflows/src/features/external-audit-dogfood/support/driver.ts
apps/codex-workflows/src/main.ts
apps/codex-workflows/src/runtime/journal.test.ts
apps/codex-workflows/src/runtime/journal.ts
apps/codex-workflows/src/runtime/local-runner.ts
apps/codex-workflows/src/source/loader.ts
apps/codex-workflows/src/source/typescript.ts
apps/codex-workflows/src/workflows/FEATURE.md
apps/codex-workflows/src/workflows/cli.spec.ts
apps/codex-workflows/src/workflows/codex-workflows.feature
apps/codex-workflows/src/workflows/direct-runner.spec.ts
apps/codex-workflows/src/workflows/index.steps.ts
apps/codex-workflows/src/workflows/model-policy.spec.ts
apps/codex-workflows/src/workflows/support/controlled-source.ts
apps/codex-workflows/src/workflows/support/controlled.workflow.fixture.txt
apps/codex-workflows/tsconfig.app.json
apps/codex-workflows/tsconfig.build.json
apps/codex-workflows/tsconfig.json
apps/codex-workflows/tsconfig.spec.json
apps/codex-workflows/vitest.config.ts
docs/reports/codex-workflows-external-audit-attempt-1.md
docs/reports/codex-workflows-external-audit-attempt-2.md
docs/reports/codex-workflows-external-audit-handoff.md
docs/reports/codex-workflows-implementation-report.md
docs/reports/codex-workflows-reimplementation-report.md
docs/reports/codex-workflows-repair-attempt-1.md
docs/reports/codex-workflows-repair-attempt-2.md
docs/reports/codex-workflows-sdk-architecture-report.md
docs/reports/codex-workflows-self-audit-report.md
docs/reports/codex-workflows-ts-runner-external-audit-handoff.md
docs/reports/codex-workflows-ts-runner-implementation-report.md
docs/reports/codex-workflows-ts-runner-self-audit-report.md
docs/reports/data-substrate-removal-forensics.md
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
packages/codex/tsconfig.runtime.json
packages/codex/tsconfig.spec.json
packages/codex/vitest.config.ts
packages/testing/evidence/codex-workflows-external-audit-attempt-3-l3-contract.json
packages/testing/evidence/codex-workflows-repair-attempt-1-contract.json
packages/testing/evidence/codex-workflows-repair-attempt-1-reproof.json
packages/testing/evidence/codex-workflows-repair-attempt-2-contract.json
packages/testing/evidence/codex-workflows-repair-attempt-2-reproof.json
packages/testing/evidence/codex-workflows-ts-runner-green-contract.json
packages/testing/evidence/codex-workflows-ts-runner-reproof.json
packages/testing/manifests/codex-workflows.json
packages/testing/manifests/codex.json
packages/testing/manifests/workflows.json
packages/workflows/SCHEMA.md
packages/workflows/eslint.config.mjs
packages/workflows/package.json
packages/workflows/project.json
packages/workflows/src/authoring/api.ts
packages/workflows/src/authoring/authoring.test.ts
packages/workflows/src/authoring/execution.ts
packages/workflows/src/authoring/types.ts
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
```

## Green Contract and prior machine proof

The Green Contract is internally well formed and the published hashes reconcile to current disk. The main reproof is nevertheless an implementer-authored claim: it explicitly says `independentPreflight: false` and `reducerApproved: false`. It cannot satisfy the canonical independent Preflight boundary by itself.

The prior live NestJS dogfood run `local-20260808t125616824z-ddeb26e89a89` is genuine and internally consistent. Its journal records exactly three completed nodes, all exact `gpt-5.6-luna` with exact `medium` reasoning. Two root nodes have distinct output digests (`sha256:fa628ca57eea733a85d5f086645b30976eb4ed7a7ec78141aebda8bb83a4e593` and `sha256:ae8f8c36e6f58e7a6ecb0a940e60e6449b7a7ce1ddd212f862ca3aaaf8c5d9ac`). The join records both root dependencies, input digest `sha256:2988bd762d28ef8370ce2177bad6b2114c05ff13a8fd6aef0ca58a5b13fdb117`, output-schema digest `sha256:dacd8718605a1bce061eebc21ba6d6de90e493f29733d28e62c1ad6cd4496aeb`, and output digest `sha256:b3acd40a1e16ed1f3ab21693167e3edb3da1ca9c9766170aec65ccca618052f7`. The 39,373-byte, 594-line resolver proposal has digest `sha256:4ad3fb16096eaef505de1806987864d027d598a1b09df2fa53128249dede055f` and contains substantive material from both requested research topics. Source control flow, dependency and digest relationships, and final artifact contents support the inference that both actual root outputs reached the consolidator. Raw root values are deliberately redacted, so that last statement is an evidence-chain inference, not a claim that the journal exposes secret input values. The run records zero cleanup delta.

The prior artifacts remain useful locked greens, but they do not close defects independently reproduced on current disk.

## Auditor-executed command evidence

All commands below ran from `/Users/mcasa_atlantis/.codex/orchestration`. Nx commands were uncached via `--skipNxCache` or targets declared `cache: false`. No zero-selection success was accepted.

| Gate or probe | Exact command | Exit / selection / decisive result |
|---|---|---|
| Nx inventory | `bun nx show projects --json` | 0; six projects: `codex-workflows`, `workflows`, `@orchestration/testing`, `@orchestration/daemon-e2e`, `codex`, `@orchestration/daemon` |
| Lint | `bun nx run-many -t lint -p workflows codex codex-workflows @orchestration/testing --parallel=3 --skipNxCache --outputStyle=static` | 0; four projects |
| Typecheck | `bun nx run-many -t typecheck -p workflows codex codex-workflows @orchestration/testing --parallel=3 --skipNxCache --outputStyle=static` | 0; four projects, including the resolved Codex build dependency |
| Build | `bun nx run-many -t build -p codex codex-workflows --parallel=2 --skipNxCache --outputStyle=static` | 0; two projects |
| L1 | `bun nx run-many -t test-l1 -p workflows codex codex-workflows @orchestration/testing --parallel=3 --skipNxCache --outputStyle=static` | 0; 26 + 23 + 9 + 24 = **82** executed tests, all passed |
| L2 | `bun nx run-many -t test-l2 -p workflows codex codex-workflows @orchestration/testing --parallel=3 --skipNxCache --outputStyle=static` | 0; workflows had no L2 target; Codex 6 + app 10 + testing 26 = **42** executed tests, all passed |
| Standing L3 | `bun nx run-many -t test-l3 -p codex-workflows @orchestration/testing --parallel=2 --skipNxCache --outputStyle=static` | 0; **6 scenarios / 34 steps**, all passed |
| Policy | `bun nx run @orchestration/testing:test-policy --skipNxCache --outputStyle=static` | 0; 21 selected before A3 and 22 after A3, seven standing targets |
| SDK import exclusivity | `bun nx run codex:test-sdk-imports --skipNxCache --outputStyle=static` | 0; one production import selected, only `packages/codex/src/runtime/adapter.ts` |
| Aggregate, first run | `GROUND_ZERO_UNCACHED=1 bun nx run-many -t test -p workflows codex codex-workflows @orchestration/testing --parallel=3 --skipNxCache --outputStyle=static` | **1**; app L2 `TS-GC2-009` failed at `direct-runner.spec.ts:336`: expected a `terminated` trace event, received none. Other selected suites continued and produced nonzero reports. |
| App aggregate retry | `GROUND_ZERO_UNCACHED=1 bun nx run codex-workflows:test --skipNxCache --outputStyle=static` | 0; 8 unit + 1 integration + 7 L2 integration + 3 L2 E2E + 5 L3 scenarios |
| Sync | `bun nx sync:check` | 0 |
| Affected closure | `bun nx affected -t lint,typecheck,build,test --files=packages/workflows/src/authoring/api.ts,packages/workflows/src/authoring/execution.ts,packages/codex/src/runtime/singleton.ts,packages/codex/src/runtime/adapter.ts,apps/codex-workflows/src/source/loader.ts,apps/codex-workflows/src/source/typescript.ts,apps/codex-workflows/src/runtime/local-runner.ts,apps/codex-workflows/src/runtime/journal.ts,apps/codex-workflows/src/cli/cli.ts,packages/testing/src/cli.ts --parallel=3 --skipNxCache --outputStyle=static` | 0; selected all four in-scope projects; lint, typecheck, build, and aggregate tests passed |
| JSON validate | `codex-workflows validate apps/codex-workflows/examples/canonical-review.workflow.json` | 0; definition digest `fdc343...` |
| JSON inspect | `codex-workflows inspect apps/codex-workflows/examples/canonical-review.workflow.json` | 0; same definition digest |
| JSON plan | `codex-workflows plan apps/codex-workflows/examples/canonical-review.workflow.json` | 0; same definition digest |
| JSON dry run | `codex-workflows dry-run apps/codex-workflows/examples/canonical-review.workflow.json` | 0; `sideEffects: []`, `sdkInitialized: false`, `durableWrites: 0` |
| `.pi` compatibility | `codex-workflows import-pi .pi` | 0; source digest matched the current `.pi` bytes; no `.pi` mutation |
| Cross-process status | `codex-workflows status nonexistent-audit-run` | 69; `CONTROL_PLANE_UNAVAILABLE` |
| Path admission | `codex-workflows inspect /etc/hosts` | 65; `PATH_OUTSIDE_ALLOWED_ROOT` |
| Direct Luna availability | ephemeral exact-Luna/exact-medium direct workflow probe through installed `codex-workflows` | 0; returned `READY`, excluding general model unavailability as the A3 schema failure cause |
| Public-executor drain attack | inline Bun import of public `executeWorkflow`; one agent fails at 20 ms, sibling ignores abort until 220 ms | 0 as a probe; rejection at 26 ms with `active: 1`; after rejection a `node.completed` event appeared after `workflow.failed` |
| Equal-value lineage attack | inline public executor; two roots return the same primitive, join consumes only the first | 0 as a probe; join falsely recorded both root dependencies |
| Journal redaction attack | direct public journal record with `token`, `apiKey`, `password`, `Authorization`, and `credentials` | 0 as a probe; all five values remained in the journal |
| Artifact collision attack | public executor with two parallel same-name artifact writes | 0 as a probe harness; workflow returned `WORKFLOW_AGENT_FAILED`; event order was `workflow.started`, `workflow.failed`, then `artifact.created`; no agent ran |
| Runtime reasoning attack | public executor with `reasoning: "not-a-reasoning-level"` | 0; adapter received that exact invalid string and the workflow completed |
| Live structured-schema attack | exact Luna/medium installed runner with a locally valid JSON Schema 2020-12 `const` property lacking a sibling `type` | 67; remote SDK returned HTTP 400 `invalid_json_schema`; CLI mislabeled it `WORKFLOW_AGENT_FAILED` |

The original candidate's complete formatter check also passed. The first four-project aggregate failure is not hidden by the subsequent pass: it is a reproducible timing-sensitive test-contract failure under concurrent load and is retained as a finding.

## Source and behavioral findings

### EXT3-001 — active work can outlive the workflow's terminal event and rejected promise (high)

`BoundedScheduler` increments private active work and resolves each scheduled promise independently, but exposes no drain operation (`packages/workflows/src/authoring/execution.ts:92`). On the first agent failure, the controller aborts and the public workflow catch emits `workflow.failed`, throws, and uninstalls the runtime (`packages/workflows/src/authoring/execution.ts:490`) without awaiting all already-started scheduled operations.

The direct public-executor attack rejected after 26 ms while one sibling remained active; that sibling ignored the advisory abort and settled around 220 ms. A `node.completed` event was emitted after `workflow.failed`. The first failed real A3 run independently reproduced the ordering at a live SDK boundary: `workflow.failed` was journal sequence 9 and the sibling's `node.failed` was sequence 10. A terminal journal entry, CLI exit, or rejected promise therefore does not imply terminal quiet. This violates failure propagation, deterministic terminal ordering, cleanup authority, and the meaning of a terminal journal state.

### EXT3-002 — digest-based lineage manufactures dependencies for equal values (high)

Dependencies are inferred by recursively hashing input values and looking up every node that has ever produced the same digest (`packages/workflows/src/authoring/execution.ts:147`), while lineage registration accumulates node IDs under the output-value digest (`packages/workflows/src/authoring/execution.ts:169`).

Two root agents returning the identical string followed by a join that consumed only the first root's result produced a join dependency list containing both roots. This is false provenance. It can make the journal claim a data dependency that did not exist and cannot distinguish equal values produced by different nodes. The defect is especially important because dependency ordering and typed dataflow are central acceptance claims.

### EXT3-003 — journal redaction leaks common secret-bearing keys (high)

The journal sanitizer uses a small case-sensitive exact-key denylist (`apps/codex-workflows/src/runtime/journal.ts:9` and `apps/codex-workflows/src/runtime/journal.ts:77`). It omits common keys including `token`, `apiKey`, `password`, `Authorization`, and `credentials`.

The auditor journal at `test-output/codex-workflows-external-audit-attempt-3/probes/runs/redaction-key-coverage/journal.json` redacted the prompt but persisted all five seeded sensitive values. Existing tests establish that arbitrary nested event records pass through this sanitizer, so this is a reachable logging boundary, not only a hypothetical helper misuse.

### EXT3-004 — concurrent same-name artifacts race, can emit after terminal failure, and are misclassified as agent failure (high)

Every artifact write uses the same temporary path `.<name>.<pid>.tmp` before rename (`apps/codex-workflows/src/runtime/journal.ts:239`). The public executor does not schedule or track artifacts in the bounded operation set (`packages/workflows/src/authoring/execution.ts:478`). Non-`WorkflowExecutionError` failures are wrapped as `WORKFLOW_AGENT_FAILED` by the executor (`packages/workflows/src/authoring/execution.ts:505`) and again by the local runner (`apps/codex-workflows/src/runtime/local-runner.ts:137`).

Two parallel writes to the same declared artifact name produced `WORKFLOW_AGENT_FAILED`, with events `workflow.started`, `workflow.failed`, then `artifact.created`; no agent ran. This combines a fixed-temp collision, post-terminal mutation, non-deterministic final artifact behavior, and wrong no-agent error attribution/exit 67. The probe journal is under `test-output/codex-workflows-external-audit-attempt-3/probes/runs/artifact-collision/`.

### EXT3-005 — trusted TypeScript can bypass the declared reasoning enum at runtime (high)

The public agent runtime validates nonempty label/model/prompt and prompt length, but not the reasoning value (`packages/workflows/src/authoring/execution.ts:315`). The TypeScript loader transpiles trusted source; it does not perform a typecheck that could enforce the static union.

A trusted source supplied `not-a-reasoning-level`; execution completed and the runtime adapter observed that exact value. Static TypeScript types are not a security or policy boundary. The runner therefore does not fail closed on an invalid agent launch profile.

### EXT3-006 — local schema acceptance is broader than the live Codex structured-output contract and exits incorrectly (high)

The runner compiles/validates output schema only after the SDK response is received (`packages/workflows/src/authoring/execution.ts:186`, called at `packages/workflows/src/authoring/execution.ts:381`). It does not preflight the actual structured-output schema subset accepted by the SDK host.

The first real A3 execution used JSON Schema 2020-12 that the local validator accepts: a `const` property without an explicit sibling `type`. Both exact Luna/medium roots failed quickly. A separate exact Luna/medium no-schema run succeeded, and a focused Luna schema probe returned SDK HTTP 400 `invalid_json_schema`, specifically requiring a `type` for the property. The CLI converted this definition/admission error into `WORKFLOW_AGENT_FAILED` and exit 67. A bad output after a successful agent belongs to the output-schema exit boundary; an SDK-rejected schema before useful agent execution belongs to definition/admission. It is neither an agent failure nor deterministic compatibility.

The authorized A3 fixture was corrected by adding the explicit `type` alongside each `const`; no product source or existing test was altered.

### EXT3-007 — the aggregate cancellation test is timing-sensitive under parallel load (medium)

The first uncached four-project aggregate failed because `apps/codex-workflows/src/workflows/direct-runner.spec.ts:336` requires at least one `terminated` trace entry. Under load, the abort can occur before the controlled child records a start/termination pair. The test still proved that no queued marker started and that every observed PID was absent, but the mandatory trace assertion failed. The isolated app aggregate and later affected aggregate passed.

This is honest failure reporting, but it means the aggregate gate is not stable enough to serve as deterministic proof. The repair must keep the resource/leak assertion load-bearing while removing the start-order race, not merely weaken the assertion.

### EXT3-008 — current immutable proof is not reducer-approved independent Preflight evidence (authority blocker)

The main reproof explicitly records that it is self-authored, not independent Preflight, and not reducer-approved. This audit supplies fresh external execution and adversarial evidence, but the required data-substrate capability/control-plane client was unavailable in the supplied environment, and no arbitrary SQL fallback was authorized. Therefore no claim is made that this report advanced canonical process state or registered a Preflight gavel.

This authority gap is not evidence that the source is wrong; it is a closeout blocker after source repairs and fresh proof.

## Claims that were independently supported

The following remain locked greens and should not be needlessly rewritten during retry:

- exact `#!/usr/bin/env -S codex-workflows` dispatch works through the installed binary and the workspace-built distribution;
- trusted-source root/path admission rejects `/etc/hosts` with exit 65 and covers symlink/root policy in existing fresh tests;
- JSON `validate`, `inspect`, `plan`, and `dry-run` remain compatible and share a stable definition digest;
- dry run produced no SDK initialization, durable write, or side-effect declaration;
- `.pi` import was read-only and source-digest preserving;
- unavailable cross-process `status` fails honestly with exit 69;
- production SDK imports are exclusive to `packages/codex/src/runtime/adapter.ts`;
- singleton admission and ordinary handled-run cleanup tests passed;
- the prior NestJS live run and the final A3 run both used exact Luna/medium and produced real artifacts;
- all isolated L1, L2, ordinary L3, lint, typecheck, build, policy, sync, affected, and compatibility checks selected nonzero work and passed;
- original candidate and prior immutable evidence hashes did not drift during audit.

These greens do not outweigh the terminal-order, false-provenance, secret-redaction, artifact-race, launch-profile, schema-admission, and proof-authority failures.

## End-of-audit L3 Luna-only contract

The additive audit contract is:

`packages/testing/evidence/codex-workflows-external-audit-attempt-3-l3-contract.json`  
SHA-256: `a3a6867d0abdfd87c465dab4c40a616912beb1c85716cfbbfc831ac03b2713fd`

It declares stable row identity, authority, post-implementation adversarial-characterization status, basic/adversarial class, L3 layer, public surface, exact Nx target, observable green, false-pass exclusions, cleanup/resource obligations, and expected source/selected/executed counts of one or greater.

The canonical executable behavior is one physical Gherkin feature with thin scenario-scoped steps and a load-bearing final assertion. It directly spawns the executable literal-shebang TypeScript source; it does not invoke `tsx`, an internal test entrypoint, or an L1/L2 target. All three agents request exact `gpt-5.6-luna` and exact `medium` reasoning. Two roots run concurrently, the consolidator begins after both complete, actual typed root fields and independent nonces are asserted at the consolidator boundary, strict schemas use `additionalProperties: false`, and a declared JSON artifact is persisted and verified.

No existing manifest edit was necessary. The supported `nx:run-commands` command override supplied the additive feature, steps, and report path through the canonical uncached `codex-workflows:test-l3` target:

```text
bun nx run codex-workflows:test-l3 --skipNxCache --outputStyle=static --command="bun packages/testing/src/cli.ts verify-cucumber apps/codex-workflows/src/features/external-audit-dogfood/external-audit-dogfood.feature apps/codex-workflows/src/features/external-audit-dogfood/index.steps.ts test-output/cucumber/codex-workflows-external-audit-attempt-3.json"
```

The audit records the fixture's real characterization history rather than manufacturing historical RED:

1. The first attempt failed before scenario execution because the Cucumber runtime could not resolve a JavaScript import to the TypeScript support driver. This zero-selection harness error was rejected as evidence. The authorized additive `support/driver.js` shim was added.
2. The second attempt selected one scenario but failed closed: exact Luna/medium execution returned exit 67 on the live structured-schema mismatch described in EXT3-006. Run `local-20260808t143118435z-d339991bc80e` had two failed nodes, no artifact, one failed scenario, one passed step, one failed step, and three skipped steps. It is not green evidence. Its journal also reproduced post-terminal node activity.
3. The schema fixture was narrowed to the live host contract with explicit property types. The final exact command passed one selected scenario and all five executed steps in 15.65 seconds. There were no pending, undefined, skipped, ambiguous, or assertion-free bindings.

Successful run ID:

`local-20260808t143316451z-2f042389a984`

Journal:

`/Users/mcasa_atlantis/.codex/orchestration/test-output/codex-workflows-external-audit-attempt-3/l3/workflow-state/runs/local-20260808t143316451z-2f042389a984/journal.json`  
SHA-256: `7689ef569f9a64e6512ce953892c307861b99e8305bfcaef112f0b1c9724919f`

Artifact:

`/Users/mcasa_atlantis/.codex/orchestration/test-output/codex-workflows-external-audit-attempt-3/l3/workflow-state/runs/local-20260808t143316451z-2f042389a984/artifacts/external-audit-attempt-3-result.json`  
SHA-256: `cb82f7bd72e567a336322a68151f0eefb031e76c3780a17bb49de5e045349891`

Cucumber report:

`/Users/mcasa_atlantis/.codex/orchestration/test-output/cucumber/codex-workflows-external-audit-attempt-3.json`  
SHA-256: `f5483dca50a2941f80625b7374ccd6a2d09f5d2282281acb50864186f023017e`

The successful journal has completed status, 16 events, final event `workflow.completed`, and exactly three completed nodes, all Luna/medium. The two roots have distinct input digests `2abfd...` and `367bc...` and distinct output digests `0146...` and `8ad9...`. Both roots started in the same millisecond before either completed. The join started only after both, names both dependencies, has input digest `860dc...`, output-schema digest `1240...`, and output digest `23cf...`. The root inputs, root outputs, and join input comprise five distinct digests. In-memory driver assertions prove the consolidator received the exact typed root fields and independent nonces. The artifact content has `status: "complete"`, `schemaEnforced: true`, both expected findings, both nonces, and a synthesized summary; its bytes match its journal digest.

The driver also proved literal shebang dispatch, installed binary resolution into this workspace distribution, process-group disappearance, no loader-temp delta, no runner-temp delta, no leftover `.tmp` file, and no workspace dirty-digest delta during the successful run.

## Resource and cleanup reconciliation

| Resource | Before audit probes | End of audit | Delta / interpretation |
|---|---:|---:|---|
| Controlled fixture child processes | 0 | 0 | 0 |
| Luna `codex exec` children | 0 | 0 | 0 |
| All `codex exec` processes | 1 | 1 | 0; the one process is this independent auditor's parent/session, not a workflow leak |
| TypeScript loader temp directories | 0 | 0 | 0 |
| Workspace runner temp files | 0 | 0 | 0 |
| Journal/artifact `.tmp` files | 0 | 0 | 0 |
| Pre-existing default workflow run directories | 3 | 3 | 0 |
| Attempt 3 workflow run directories | 0 | 2 | two authorized audit artifacts: one failed schema characterization and one successful L3 run; intentionally retained, not leaked temp state |

All currently observed child/temp counts returned to baseline. That does not erase EXT3-001: the public promise and terminal event can precede quiet, even though every observed child eventually exited in these probes.

## Five-dimension scorecard

| Dimension | Point | Basis |
|---|---:|---|
| 1. API and direct-runner contract correctness | 0 | Runtime reasoning policy is bypassable, and a locally admitted schema becomes a live host-definition failure mislabeled as agent failure. |
| 2. SDK lifecycle, policy, safety, and cleanup correctness | 0 | Active work can outlive terminal failure/uninstall, and the operational journal leaks common secret-bearing keys. Eventual observed cleanup is insufficient. |
| 3. Typed composition/dataflow, concurrency, schema, journal, and artifact correctness | 0 | Equal outputs manufacture false dependencies; concurrent same-name artifact writes race and mutate after terminal failure; live schema admission is inconsistent. |
| 4. Compatibility, deterministic exits, evidence integrity, test quality, and false-green resistance | 0 | Compatibility and hashes are green, but schema admission exits 67 incorrectly, the concurrent aggregate gate is timing-sensitive, and canonical reducer-approved independent Preflight proof is absent. |
| 5. End-of-audit real L3 Luna-only dogfood contract and execution | 1 | The final additive contract selected and executed one real literal-shebang scenario, exactly three Luna/medium nodes, typed fan-out/join, strict schema, artifact/digest validation, and zero child/temp delta. |

Canonical score: **1/5**. This score is below commit-recommendation eligibility. The candidate must not be committed on this evidence.

## BLOCKED

The current-disk candidate is blocked. The blockers are independently reproduced semantic and safety failures, not missing prose. No required change is hidden behind a conditional verdict.

## Exhaustive retry ledger and dependency DAG

Preserve the locked greens listed above. Do not expand features, durable authority, packages, applications, services, transports, domain dependencies, DAG edges, infrastructure, or write surfaces. Repair only existing accepted behavior and its existing source/test seams.

### Parallel repair lanes

1. **Lifecycle and terminal-order lane — EXT3-001.** Authorized smallest surfaces: `packages/workflows/src/authoring/execution.ts`, its authoring tests, and existing direct-runner lifecycle fixtures/tests. Track every started agent and artifact operation. On failure/cancel, signal abort, await all started operations to settle, classify each node once, and only then emit one workflow terminal event, uninstall the runtime, finalize the journal, release the SDK host, and return/throw. Prove no node/artifact event or write can occur after a workflow terminal event or CLI return, including an abort-ignoring adapter.

2. **Provenance lane — EXT3-002.** Authorized smallest surfaces: existing authoring types/API/execution and their L1 tests. Replace value-digest inference with explicit, identity-bearing provenance that follows the actual returned result through composition, or fail closed where provenance is ambiguous. Preserve typed user values at the public surface. Add an adversarial equal-output case in which consuming only one root records only that root; add nested, copied, and literal-collision cases. Do not accept merely deduplicating identical digests.

3. **Launch-profile and schema-admission lane — EXT3-005/006.** Authorized smallest surfaces: existing authoring contracts/execution, TypeScript source admission/loader, Codex adapter validation, CLI error mapping, and existing tests. Runtime-validate the exact model/reasoning policy before launch. Prevalidate the exact structured-output subset accepted by the pinned live SDK host before starting an agent, with deterministic definition/admission attribution and exit 65. Preserve exit 68 for a real agent response that fails an already-admitted output schema. Test trusted transpiled source, invalid runtime strings, locally valid but host-invalid schemas, malformed agent output, and exact Luna/medium preservation.

4. **Journal/redaction/artifact lane — EXT3-003/004.** Authorized smallest surfaces: existing journal/local-runner/CLI files and their existing test seams. Replace the exact case-sensitive secret denylist with a reviewed safe-view/allowlist or comprehensive case-normalized sensitive-key policy. Add nested/case/alias attacks for token, authorization, API keys, passwords, credentials, cookies, and provider errors without exposing seeded secrets in test reports. Give concurrent artifact writes unique temp paths and an explicit deterministic duplicate-name contract (serialize/reject/fail closed); include artifacts in lifecycle draining. Attribute storage/internal failures to the correct non-agent exit. Prove atomic bytes/digest, no post-terminal writes, and no temp residue under collision/failure.

5. **Deterministic aggregate-test lane — EXT3-007.** Authorized smallest surfaces: the existing controlled fixture, direct-runner test, and testing policy/harness only as needed. Introduce a deterministic readiness/barrier handshake or assert termination only for processes proven started. Keep load-bearing proof that queued work never starts and every observed child/process group is reaped. Run the app aggregate repeatedly under parallel workspace load. Do not delete or weaken cleanup assertions.

### Join and independent closeout

After all five lanes join:

1. Freeze the repaired candidate and recompute a new exact manifest/digest while preserving all prior immutable evidence as historical artifacts.
2. Run uncached nonzero lint, typecheck, build, L1, L2, ordinary L3, Attempt 3 L3, aggregates under load, affected closure, policy, SDK-import exclusivity, source admission, JSON compatibility, exit-code matrix, format/sync, and before/after resource gates.
3. Add focused auditor probes for abort-ignoring work, post-terminal mutation, equal-value provenance, sensitive-key variants, same-name artifacts, runtime-invalid reasoning, and live-host-invalid schemas. Every probe must have nonzero source/selected/executed counts and machine-readable output.
4. Use a fresh Preflight identity and the canonical scoped control-plane client to register immutable proof over the exact candidate. It must be reducer-approved and include uncached machine artifacts plus cleanup/resource deltas.
5. Use a fresh successor Judge, independent of every repair, for semantic review and the final gavel. This Attempt 3 Judge must not self-certify the repair.

The next action is the bounded parallel repair DAG above, followed by fresh reducer-approved Preflight and a fresh independent judgment. Commit recommendation is **not eligible** at 1/5.

EXTERNAL_AUDIT_ATTEMPT_3_COMPLETE

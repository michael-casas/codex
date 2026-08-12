# Codex Workflows Bounded Repair — Audit Attempt 2

**Campaign:** `CDX-WF-2026-08-07`  
**Repair authority:** human-issued failed-only serialized repair charter for
`CWF2-AUD-001` through `CWF2-AUD-003`  
**Role boundary:** fresh Repair Worker evidence only; no Preflight,
verification, reducer approval, judgment, acceptance, or score  
**Independent audits preserved:**
`codex-workflows-external-audit-attempt-1.md` and
`codex-workflows-external-audit-attempt-2.md`

## Outcome and stop boundary

All three authorized product findings have bounded repairs and their required
local gates pass. This candidate is ready only for the mandatory fresh
independent Preflight identified by `CWF2-AUD-004`. It is not ready for re-audit
or acceptance on Worker evidence alone.

No feature, workflow behavior, durable authority, daemon, control-plane
substitute, queue, retry path, transport, database, package edge, project
target, or manifest was added. No commit, stage, push, merge, publish, deploy,
worktree cleanup, Agent Wiki mutation, `.pi` mutation, audit mutation, or
unrelated-state cleanup occurred.

The requested global `data-substrate` skill and scratchpad initializer were not
available in the configured skill roots. No credential, database, or substitute
durable-state path was invented. The six available required skills were read
and followed: `batdd`, `agent-wiki`, `workflows`, `nx-workspace`,
`nx-run-tasks`, and `link-workspace-packages`.

## Candidate identities and content addressing

- Base revision:
  `28c4650c676644bdfac11aa25c46d5be9b15f833`.
- Pre-repair candidate: 78 included dirty/untracked paths, aggregate SHA-256
  `8b25e2c880fcdd24461860eaae45dc85d961137a589632a767efb63ed4cafefd`.
- Final candidate: 79 included dirty/untracked paths, aggregate SHA-256
  `3ab8274f61ad91f8843d979c6b7df86d40ffaf0df57fbac398135a3da05da0d5`.
- Candidate algorithm: sort `git ls-files -m --others --exclude-standard` after
  excluding `.pi/**`, both independent audits, this report, and the Repair
  Attempt 2 re-proof; SHA-256 every included file, byte-sort the
  `<hash>  <path>\n` records, then SHA-256 their concatenation.
- Additive contract `CDX-WF-AUD2-REPAIR-GC1`: canonical `/contract` digest
  `sha256:095eed6c60da38755ad70e944e48efdfb54139fc4ecf2292156b913237bcb2df`;
  contract file SHA-256
  `d97fbacf181f755b050803b586763c381dfb615f0dff09a80374f8b1c94327f8`.
- Present-day re-proof: canonical `/evidence` digest
  `sha256:9205215fc1e8ab105c1ffc19e072d508bc0946ca18b944c4c26d3254f546eff4`;
  file SHA-256
  `63d36b939cc4f9ee012f76214a0f28b79b44bcf154f6154ccb51bc41093ac1d8`.

The recovery artifact is
`packages/testing/evidence/codex-workflows-repair-attempt-2-reproof.json`.
Its content address, candidate algorithm, exact counts, artifact hashes,
authority flags, and Preflight charter are machine-readable. It explicitly
disclaims historical RED registration, immutable Preflight registration,
reducer approval, verification, judgment, acceptance, and score.

## Additive contract and post-freeze ledger

The contract was frozen before the first product GREEN write with five runtime
rows:

1. private full-admission equality and secret-independent public diagnostics;
2. real controlled-child conflict behavior;
3. actual exhaustive standing-target selection;
4. honest zero/malformed/nonzero child count artifacts; and
5. a consumer guard that accepts failed zero evidence without treating it as a
   pass.

One newly added L2 fixture literal was corrected after the first GREEN run: the
real SDK renders the asserted nested TOML value as
`{value = "admitted"}` rather than `{ value = "admitted" }`. The admitted
value and conflict assertion did not change. Four incremental policy attacks
were then added and made meaningfully RED before their respective fixes:
config-exclude omission, an `echo vitest run` executable spoof, and an imported
dynamic config spread, plus include-shaped text inside an unrelated JavaScript
string. Bounded Prettier formatting changed no contract meaning.
The immutable `/contract` digest remained unchanged; all source hashes and the
fixture correction are recorded in the contract's post-freeze ledger.

The rejected invocation that appended a second `--testNamePattern` to
`codex:test-l1-unit` was an invalid Vitest harness call and is not claimed as
RED evidence.

The first string-decoy draft still supplied exact positional files, so its
expected unprovable-selection result was too strict; that failed draft and its
fixture-correction run are also excluded. The corrected config-only fixture was
replayed against the one-line pre-fix parser and produced the 0.344s semantic
RED recorded below before the fix was restored.

## Per-finding RED and GREEN

All commands were Nx-backed and uncached. Durations below are Nx run durations;
the re-proof also records wall durations for each separate GREEN and
incremental RED call.

| Finding                    | Meaningful RED                                                                                                                                                                                                                                               | GREEN                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `CWF2-AUD-001` L1          | Private matrix selected 2: 1 passed, 1 failed; exit 1; 0.423s. Full L1 had 14 locked passes and only the new private row plus the human-authorized correction of the weakened reuse assertion failed; 0.461s.                                                | Exact filter selected/executed 2/2; exit 0; 0.480s.                             |
| `CWF2-AUD-001` L2          | Real child selected 1: 1 failed; exit 1; 0.311s. Full L2 retained 5 locked passes and only the new conflict case failed; 0.736s.                                                                                                                             | Exact filter selected/executed 1/1; exit 0; 0.434s.                             |
| `CWF2-AUD-002` initial     | Unmatched config-only include selected 1: 1 failed; exit 1; 0.306s.                                                                                                                                                                                          | Final fixture matrix selected/executed 1/1; exit 0; 0.377s.                     |
| `CWF2-AUD-002` incremental | Config exclude omission: exit 1, 0.341s. Echo-spoofed runner: exit 1, 0.359s. Dynamic config spread: exit 1, 0.667s. String-decoy config-only include: exit 1, 0.344s. Each valid attack selected 1 and failed only on the intended missing policy behavior. | The same growing fixture matrix passed after each bounded repair; final exit 0. |
| `CWF2-AUD-003` L1          | Failed-zero consumer guard selected 1: 1 failed; exit 1 within the 0.306s combined targeted L1 call.                                                                                                                                                         | Combined `CWF2-AUD-00` filter selected/executed 2/2; exit 0; 0.329s.            |
| `CWF2-AUD-003` L2          | Machine artifact cases selected 3: 3 failed; exit 1; 0.483s. Full L2 retained 21 locked passes; only the three new cases failed; 5.6s.                                                                                                                       | Exact filter selected/executed 3/3; exit 0; 0.441s.                             |

### `CWF2-AUD-001` — private full-admission conflict authority

The singleton now retains a deeply snapshotted private admission configuration
and the admitted adapter-factory identity. Equality is recursive,
key-order-independent for objects, order-sensitive for arrays, and
identity-sensitive for callbacks/factories. A difference in path, base URL,
API key, primitive or nested config, array contents, environment key set or
value, observer, factory, or any combination throws only
`CODEX_HOST_CONFLICT`.

The public diagnostics contract remains separate. The public fingerprint still
contains only the prior non-secret public path/base projection; API keys,
config values, environment values, callbacks, and factory identity are neither
returned nor hashed into it. Diagnostics and sorted `envKeys` remain deeply
immutable. Caller and nested mutation do not alter the admitted snapshot.

The real SDK/controlled-child regression proves that a conflicting request
does not invoke a second factory or child, cannot replace/bypass the admitted
host, and cannot leak its values. The original admitted child receives its
original nested config/environment, active operations return to zero, and its
temporary root is removed.

### `CWF2-AUD-002` — actual standing-target selection

The policy now verifies the command tokenization and actual Vitest executable,
rejects every unexpanded positional glob, resolves exact project-local file
lists, and detects unknown, omitted, or cross-layer files. Supported
config-based discovery is bounded to statically provable object config: literal
`include`/`exclude` arrays are parsed, their globs are resolved against the
known project test-file set, and exhaustive nonzero layer equality is checked.
Property-shaped content inside JavaScript strings/comments is ignored.
Unmatched patterns, unsupported globs, dynamic spreads/mutations, unreadable
config, command/config `passWithNoTests`, and cached L2 all fail closed.

The current `workflows:test-l1` config-only target is therefore certified by
actual resolution, not suffix-text presence. The four exact audited standing
targets remain exhaustive and nonzero. The testing policy selected 17 policy
files, inspected 7 standing targets, and exited 0 in 0.113s.

### `CWF2-AUD-003` — honest zero-selection evidence

The aggregate collector now carries `{ selected, executed }` separately. A
valid child summary `Tests 0 passed` with child exit 0 is converted to aggregate
failure without changing either actual count: the artifact contains child
`selected: 0`, `executed: 0`, `exitCode: 1`, `status: failed`; aggregate exit is
1 and status is `failed`. Malformed output preserves `selected: 0` and
`executed: null` under failure. Valid `Tests 3 passed` preserves 3/3 and passes.

The aggregate validator accepts structurally honest failed-zero evidence only
when its child has nonzero exit and failed status; it rejects the same zero
counts under passed status. Passing aggregate and L3 consumers continue to
require nonzero selected evidence. No consumer or re-proof path reclassifies a
failed zero as nonzero.

## Exact write-path map

Product implementation:

- `packages/codex/src/runtime/singleton.ts`
- `packages/testing/src/lib/testing.ts`
- `packages/testing/src/cli.ts`

Additive regressions:

- `packages/codex/src/runtime/singleton.test.ts`
- `packages/codex/src/runtime/sdk.spec.ts`
- `packages/testing/src/ground-zero/harness.test.ts`
- `packages/testing/src/ground-zero/harness.spec.ts`

Evidence and direct claim reconciliation:

- `packages/testing/evidence/codex-workflows-repair-attempt-2-contract.json`
- `packages/testing/evidence/codex-workflows-repair-attempt-2-reproof.json`
- `PLAN.md`
- existing implementation, self-audit, reimplementation, handoff, and Repair
  Attempt 1 reports, each with an additive Attempt 2 reconciliation notice
- this report

No `project.json`, test manifest, package dependency, root SPEC/ARCHITECTURE,
original feature/scenario, workflow planner/schema, CLI product, daemon,
global-skill, audit, or `.pi` path changed in this repair.

## Fresh standing, aggregate, closure, and dogfood evidence

The complete uncached standing-layer matrix passed in 24.2s:

| Project                  | L1 unit | L1 integration | L1 all | L2 integration | L2 E2E | L2 all |                     L3 |
| ------------------------ | ------: | -------------: | -----: | -------------: | -----: | -----: | ---------------------: |
| `workflows`              |      13 |              8 |     21 |            N/A |    N/A |    N/A |                    N/A |
| `codex`                  |      16 |              7 |     23 |              6 |    N/A |      6 |                    N/A |
| `codex-workflows`        |       6 |            N/A |      6 |              2 |      2 |      4 | 3 scenarios / 13 steps |
| `@orchestration/testing` |      21 |              3 |     24 |             24 |      2 |     26 |   1 scenario / 6 steps |

Fresh aggregate artifacts preserve exact selected/executed values:

| Aggregate                                 | Passed selected/executed                                                    | Artifact duration | SHA-256                                                            |
| ----------------------------------------- | --------------------------------------------------------------------------- | ----------------: | ------------------------------------------------------------------ |
| `workflows:test`                          | L1 unit 13/13; L1 integration 8/8                                           |            1.252s | `3d70d979a2d6f253bac0012c3e28e0a8a4dcab16605be0187df77b8a6cce6812` |
| `codex:test`                              | L1 unit 16/16; L1 integration 7/7; L2 integration 6/6                       |            1.187s | `84299019c2fca5379ae55099ba6d49ff123216daccf12b9feb767cbc33d012e6` |
| `codex-workflows:test`                    | L1 6/6; L2 integration 2/2; L2 E2E 2/2; L3 3/3                              |            2.606s | `7366c3e4d537b6c43b0f6bd22fe545e3983b3ecc199ed4d13d2faa38861528ac` |
| `@orchestration/testing:test:ground-zero` | L1 unit 21/21; L1 integration 3/3; L2 integration 24/24; L2 E2E 2/2; L3 1/1 |            7.261s | `0978fa5c0d90d008c837963be3de83c3ab8d1c43dfa3e27f734e481b39b4a89e` |

Additional final gates:

- Explicit `bun nx affected -t lint,typecheck,build,test` over the 14 exact
  Repair Attempt 2 included paths selected `codex` and
  `@orchestration/testing`. Applicable lint, typecheck, and test targets plus
  `codex:test-sdk-imports` and `@orchestration/testing:test-policy` passed
  uncached; exit 0; 10.6s. Neither affected project owns a build target.
- SDK-import policy scanned 49 files, found exactly one allowed occurrence and
  zero offenders; exit 0; 0.255s.
- `bun nx sync:check --outputStyle=static`: exit 0; workspace up to date.
- Exact bounded `bun nx format:check`: exit 0. The unrelated known architecture
  report formatting follow-up was not widened into this wave.
- Uncached CLI dogfood through `codex-workflows:cli` ran `validate`, `inspect`,
  `plan`, and `dry-run`; each exit 0 and each Nx run took 2.4s. Definition
  digest remained
  `sha256:fdc34332585f8d3ca5ebc768b2dd090997c4897bcf9ba89d2cccc190ad3bb884`;
  plan size remained 7; dry-run reported zero side effects, zero durable writes,
  and no SDK initialization.

## Immutability and cleanup

Immutable audit hashes recomputed unchanged:

- Attempt 1:
  `7e3f5753651b7887476dc562c453fb96ded8e9a7993f827a2f46e30828a4ed46`
- Attempt 2:
  `06f41544f043f323163f086aa92ee315114df7a3613cc4e11178fed2d89aaf7e`

`.pi` hashes recomputed unchanged:

- `.pi/goals/goal_events.jsonl`:
  `b286b4a30a1fecd9181b2931404b2995a0eb3dbd4862f75f82a17e38a439e300`
- archived goal note:
  `1a1fac4047a1795f706cf2eab13030e322f54d959f560ca20e3446b620d49b64`

Controlled-child count was 0 before and 0 after. Matching SDK OS-temporary
paths were 0 before and 0 after. Matching workspace temporary roots were 0
before and 0 after. The pre-existing unrelated
`/private/tmp/codex-workflows-old-monitor-flush.json` remained present and was
not cleaned. Process and repair-owned temporary-path deltas are both zero.

## Remaining limitation and fresh Preflight charter

`CWF2-AUD-004` remains intentionally open as an authority step. A fresh
independent Preflight identity must operate on exact candidate
`3ab8274f61ad91f8843d979c6b7df86d40ffaf0df57fbac398135a3da05da0d5` and:

1. recompute the 79-path candidate, contract, re-proof, audit, and `.pi`
   identities;
2. run the selected standing, policy, SDK-import, aggregate, affected, sync,
   formatting, dogfood, and cleanup gates uncached where declared;
3. register immutable machine artifacts and resource deltas through the scoped
   process control plane; and
4. obtain the deterministic reducer-approved Preflight transition.

This Worker report and mutable recovery JSON must not be relabeled as
historical RED registration, Preflight, reducer approval, verification,
judgment, acceptance, or score.

REPAIR_STATUS: READY_FOR_PREFLIGHT

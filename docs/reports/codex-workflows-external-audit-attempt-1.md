# Codex Workflows External Audit — Attempt 1

**Audit role:** fresh independent external auditor; no candidate implementation or repair  
**Audit window:** 2026-08-07 EDT  
**Workspace:** `/Users/mcasa_atlantis/.codex/orchestration`  
**Recommendation:** repair; do not commit the current candidate

## Executive judgment

The candidate is not ready for a responsible commit. The built CLI's local,
read-only behavior is substantially implemented and the complete six-project Nx
affected closure passes. Fresh aggregate artifacts contain nonzero L1, L2, and
L3 execution, durable commands fail closed, source admission withstands the
tested path/size/UTF-8 attacks, `.pi` remained byte-identical, and no child or
temporary-resource delta remained.

Those positives do not cure six material blockers:

1. the Codex host configuration is caller-mutable after initialization, an
   actual later Codex child consumes the mutation under the stale fingerprint,
   and the public mutable diagnostics fingerprint can be changed to bypass the
   conflicting-initialization check;
2. a returned workflow plan aliases its normalized input, allowing policy and
   capability mutations to alter later plans while the definition digest stays
   unchanged;
3. four standing Nx layer targets select zero tests and fail;
4. RED provenance exists only as authored Markdown claims, not immutable or
   machine-readable evidence bound to a candidate assignment;
5. the SDK import exclusivity check misses valid side-effect imports and
   CommonJS `require` forms while reporting a synthetic `selected: 1`; and
6. malformed JSON Pointer escapes are admitted by full workflow normalization.

Under the canonical binary rubric, every axis therefore scores zero. A critical
authority/integrity defect, material repair findings, and genuinely failing
required standing gates independently activate the 3/5 cap; the raw score is
already below it.

## 1. Candidate identity and dirty-state scope

- Branch: `development`.
- Base/current `HEAD`: `28c4650c676644bdfac11aa25c46d5be9b15f833`.
- Local branch position observed before audit: two commits ahead of
  `origin/development`.
- The audited candidate is the current on-disk dirty tree, not a candidate
  commit.
- Before this report was created, `git status --short --untracked-files=all`
  contained 72 paths: 5 tracked modifications and 67 untracked files.
- Two untracked `.pi` fixtures were treated as preserved pre-existing input, not
  candidate output. Excluding those two files and this audit report, the
  candidate consisted of 70 dirty paths.
- Aggregate SHA-256 over the sorted per-file SHA-256 records for those 70 paths:
  `e2d7cba72fb07323850a15e8c47f33873b2aa038400c00018e1a1fb736d2022d`.
  It was identical before and after verification.

The five tracked modifications were:

- `.vscode/launch.json`
- `README.md`
- `bun.lock`
- `packages/testing/src/ground-zero/harness.spec.ts`
- `tsconfig.json`

The 65 untracked candidate files comprised the exact following grouped scope:

- root contracts: `ARCHITECTURE.md`, `PLAN.md`, and `SPEC.md` (3);
- `apps/codex-workflows/**` source, tests, feature, examples, docs, Nx/package,
  TypeScript, ESLint, Vitest, and asset placeholder files (19);
- the architecture, implementation, self-audit, reimplementation, and external
  handoff reports under `docs/reports/` (5);
- `packages/codex/**` source, controlled executable, tests, import checker,
  package/Nx, TypeScript, ESLint, and Vitest files (17);
- the three new aggregate manifests under `packages/testing/manifests/` (3);
- `packages/workflows/**` source, tests, schema docs, package/Nx, TypeScript,
  ESLint, and Vitest files (18).

The preserved untracked `.pi` inputs were:

- `.pi/goals/goal_events.jsonl`
- `.pi/goals/archived/goal_2026071612024695_mrn48esr-mggbiz.md`

I inspected the complete tracked diff, all 65 untracked candidate files, both
preserved `.pi` inputs, all generated machine evidence used below, and all five
global workflows-skill files. Generated build/test/cache output was not treated
as candidate source.

## 2. Authority and context used

I followed the repository's root `AGENTS.md`, root `README.md`, and the nearest
package README (`packages/testing/README.md`). I invoked and followed the
`agent-wiki`, `batdd`, `workflows`, `nx-monorepo`, `nx-workspace`, and
`nx-run-tasks` skills. No Agent Wiki note was changed.

`wiki status --json` returned healthy and fresh with 34 indexed notes. Through
the `wiki` CLI I read the complete canonical
`codex/orchestration/SPEC.md` and the linked TESTING, BATDD, AUDIT,
ORCHESTRATION, GHERKIN, and ROLES standards. Their read line counts were 2,055,
440, 188, 519, 337, 199, and 167 respectively.

Repository authority read in full included:

- `TESTING.md`;
- `.agents/batdd/WORKER-CONTRACT.md`, `.agents/batdd/profile.json`, both BATDD
  JSON schemas, and `.agents/batdd/assignments/G0.W1.json`;
- `SPEC.md`, `ARCHITECTURE.md`, `PLAN.md`, `PRD.md`, `DOMAINS.md`, and the
  relevant feature/schema/CLI documents;
- the SDK architecture, implementation, self-audit, reimplementation, and
  external-audit handoff reports; and
- the global workflows skill, `agents/openai.yaml`, and all three references.

The compiled BATDD profile and the only assignment validate under JSON Schema
2020-12 when Ajv's schema-lint option `strictRequired` is disabled. With Ajv
strict mode unmodified, the pre-existing profile schema itself fails to compile
because conditional `required` entries are not redeclared in the conditional
subschema. That schema/compiler mismatch predates and is outside this candidate;
it is not scored as a candidate finding. The only on-disk assignment is the
terminal, non-dispatchable Ground-0 worker assignment `G0.W1`, which does not
authorize or evidence this Codex Workflows campaign.

## 3. Fresh execution ledger

Durations below are captured wall times. Every Nx verification command shown as
fresh used `--skipNxCache`; live L2/L3 targets also resolve with `cache: false`.

### 3.1 Nx graph, policy, standing layers, and aggregates

| Command                                                                             | Exit |    Wall | Selected/executed result                                                   | Artifact                                                                 |
| ----------------------------------------------------------------------------------- | ---: | ------: | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `bun nx show projects --json`                                                       |    0 |  1.12 s | 6 projects                                                                 | stdout                                                                   |
| `bun nx graph --print`                                                              |    0 |  1.39 s | `codex-workflows -> workflows`; `codex` and `workflows` otherwise isolated | stdout                                                                   |
| `bun nx run @orchestration/testing:test-policy --skipNxCache --outputStyle=static`  |    0 | 0.364 s | 16 files selected                                                          | stdout                                                                   |
| `bun nx run codex:test-sdk-imports --skipNxCache --outputStyle=static`              |    0 | 0.077 s | reports `selected: 1`                                                      | stdout; see `CWF-AUD-005`                                                |
| `bun nx run workflows:test-l1 --skipNxCache --outputStyle=static`                   |    0 | 0.722 s | 17 passed                                                                  | Vitest output                                                            |
| `bun nx run codex:test-l1 --skipNxCache --outputStyle=static`                       |    1 | 0.242 s | **0 selected; no test files found**                                        | stdout/stderr                                                            |
| `bun nx run codex:test-l2 --skipNxCache --outputStyle=static`                       |    1 | 0.335 s | **0 selected; no test files found**                                        | stdout/stderr                                                            |
| `bun nx run codex-workflows:test-l1 --skipNxCache --outputStyle=static`             |    1 | 0.217 s | **0 selected; no test files found**                                        | stdout/stderr                                                            |
| `bun nx run codex-workflows:test-l2 --skipNxCache --outputStyle=static`             |    1 | 0.916 s | **0 selected; no test files found**                                        | stdout/stderr                                                            |
| `bun nx run codex:test-l2-integration --skipNxCache --outputStyle=static`           |    0 | 0.782 s | 4 passed                                                                   | Vitest output                                                            |
| `bun nx run codex-workflows:test-l2-integration --skipNxCache --outputStyle=static` |    0 | 1.292 s | 2 passed, 2 filtered/skipped                                               | Vitest output                                                            |
| `bun nx run codex-workflows:test-l2-e2e --skipNxCache --outputStyle=static`         |    0 | 1.299 s | 2 passed, 2 filtered/skipped                                               | Vitest output                                                            |
| `bun nx run codex-workflows:test-l3 --skipNxCache --outputStyle=static`             |    0 | 1.559 s | 3 scenarios, 13 steps passed                                               | `test-output/cucumber/codex-workflows.json`                              |
| `bun nx run workflows:test --skipNxCache --outputStyle=static`                      |    0 | 1.004 s | 10 L1 unit + 7 L1 integration                                              | `test-output/codex-workflows/workflows.json`                             |
| `bun nx run codex:test --skipNxCache --outputStyle=static`                          |    0 | 1.189 s | 4 L1 unit + 7 L1 integration + 4 L2 integration                            | `test-output/codex-workflows/codex.json`                                 |
| `bun nx run codex-workflows:test --skipNxCache --outputStyle=static`                |    0 | 3.421 s | 6 L1 unit + 2 L2 integration + 2 L2 E2E + 3 L3 scenarios                   | `test-output/codex-workflows/codex-workflows.json` and Cucumber artifact |

The narrower and manifest-driven runs diagnose the failed standing targets as
target-command defects rather than failures of the underlying tested behavior.
That diagnosis does not convert a required zero-selection standing target into
valid evidence.

### 3.2 Complete affected closure

The exact 70 candidate paths were streamed, one per line, to Nx. Selection was:

```text
["codex-workflows","codex","@orchestration/testing","workflows","@orchestration/daemon-e2e","@orchestration/daemon"]
```

Fresh command:

```text
git ls-files -m --others --exclude-standard |
  rg -v '^\.pi/|^docs/reports/codex-workflows-external-audit-attempt-1\.md$' |
  bun nx affected --stdin -t lint,typecheck,build,test \
    --skipNxCache --outputStyle=static --parallel=3
```

Exit was 0 in 10.159 seconds. Nx ran lint, typecheck, applicable builds, and
aggregate tests for all six projects plus `test-policy` and
`test-sdk-imports`. The testing aggregate selected 18 L1 unit, 3 L1
integration, 20 L2 integration, 2 L2 E2E, and 1 L3 scenario; the existing daemon
and daemon-e2e aggregates also passed. `bun nx sync:check` exited 0 in 0.065
seconds.

This affected success is genuine for the aggregate `test` targets, but those
manifests invoke exact files directly and therefore bypass the four broken
standing `test-l1`/`test-l2` commands.

### 3.3 Fresh machine-readable artifacts

| Path                                               | Status | Selected/executed counts                                              | Fresh mtime (EDT)   |
| -------------------------------------------------- | ------ | --------------------------------------------------------------------- | ------------------- |
| `test-output/codex-workflows/workflows.json`       | passed | L1 unit 10; L1 integration 7; declared N/A elsewhere                  | 2026-08-07 23:52:12 |
| `test-output/codex-workflows/codex.json`           | passed | L1 unit 4; L1 integration 7; L2 integration 4; declared N/A elsewhere | 2026-08-07 23:52:14 |
| `test-output/codex-workflows/codex-workflows.json` | passed | L1 unit 6; L2 integration 2; L2 E2E 2; L3 3                           | 2026-08-07 23:52:16 |
| `test-output/ground-zero/testing.json`             | passed | L1 unit 18; L1 integration 3; L2 integration 20; L2 E2E 2; L3 1       | 2026-08-07 23:52:20 |
| `test-output/cucumber/codex-workflows.json`        | passed | 3 scenarios; 13/13 steps passed                                       | 2026-08-07 23:52:16 |
| `test-output/cucumber/ground-zero.json`            | passed | 1 scenario; 6/6 steps passed                                          | 2026-08-07 23:52:20 |

The artifacts have schema version 1, passed child exits, nonzero required-layer
selection, durations, commands, and child artifact references. They are current
GREEN evidence, not historical RED provenance.

### 3.4 Public CLI and skill dogfood

- The documented skill command
  `bun nx run codex-workflows:cli -- plan ... --input ... --json` exited 0 in
  1.444 seconds and returned seven deterministic planned nodes.
- Direct executable `apps/codex-workflows/dist/main.js validate ... --json`
  exited 0 in 0.172 seconds. The built file is executable and begins with one
  Node shebang.
- A direct four-command probe completed in 0.515 seconds. `validate`, `inspect`,
  `plan`, and `dry-run` each returned exit 0, one JSON stdout line, zero stderr
  bytes, the same definition digest
  `sha256:fdc34332585f8d3ca5ebc768b2dd090997c4897bcf9ba89d2cccc190ad3bb884`,
  and no raw prompt. Plan and dry-run shared the same input digest and seven
  nodes; dry-run reported zero durable writes, no SDK initialization, and no
  side effects. Repeated plan stdout was byte-identical.
- A durable-command probe completed in 0.157 seconds. `run`, `resume`, `status`,
  `events`, `logs`, and `cancel` each returned process exit 69, zero stdout
  bytes, and one JSON stderr line with `CONTROL_PLANE_UNAVAILABLE`. `run` against
  a nonexistent workflow also returned 69 before source I/O.
- `.pi` import dogfood completed in 0.090 seconds. Both preserved inputs returned
  exit 0 twice with byte-identical stdout and unchanged source hashes.
- The global workflows skill passed canonical `quick_validate.py`. Its five
  files and SHA-256 values were identical before and after audit.

### 3.5 Formatting

The exact candidate-file command

```text
git ls-files -m --others --exclude-standard |
  rg -v '^\.pi/|^docs/reports/codex-workflows-external-audit-attempt-1\.md$' |
  bun nx format:check --stdin
```

exited 1 in 0.694 seconds and identified
`docs/reports/codex-workflows-sdk-architecture-report.md`. This contradicts the
external-audit handoff's claim that the exact campaign-file format check passed.
It is classified as a non-material follow-up rather than a product blocker.

## 4. Adversarial checks and false-green attacks

### Checks that held

- **Path admission:** direct `/etc/hosts` and a symlink inside an allowed root
  resolving to `/etc/hosts` returned 65/`PATH_OUTSIDE_ALLOWED_ROOT`.
- **File type/readability:** a directory returned
  66/`SOURCE_NOT_REGULAR`; a missing path returned
  66/`SOURCE_NOT_READABLE`.
- **Byte and text bounds:** a source over 1 MiB returned
  65/`SOURCE_TOO_LARGE`; invalid UTF-8 returned 65/`UTF8_INVALID`.
- **Prompt redaction:** none of the canonical source's raw Codex prompts appeared
  in `validate`, `inspect`, `plan`, or `dry-run` JSON.
- **Durable authority:** all durable verbs, including `run` against a missing
  source, refused before SDK or source activity with stable exit 69.
- **SDK lifecycle:** the fresh real-SDK L2 suite spawned the controlled binary,
  bound new/resumed thread IDs, forwarded structured options, aborted, and
  reaped its child; 4/4 tests passed.
- **`.pi` read-only behavior:** before and after SHA-256 values were exactly
  `b286b4a30a1fecd9181b2931404b2995a0eb3dbd4862f75f82a17e38a439e300`
  and
  `1a1fac4047a1795f706cf2eab13030e322f54d959f560ca20e3446b620d49b64`.

### False-green attacks that succeeded

- Executing the standing layer targets, rather than their manifest substitutes,
  exposed four zero-test failures (`CWF-AUD-003`).
- Mutating the caller's initialized Codex config from `before` to `after` caused
  the actual controlled child to receive `audit_marker="after"`; the host
  fingerprint did not change (`CWF-AUD-001`).
- Mutating `host.diagnostics.fingerprint` to the fingerprint of a second config
  caused `initializeCodexHost(secondConfig)` to return the original host instead
  of raising `CODEX_HOST_CONFLICT` (`CWF-AUD-001`).
- Mutating a returned plan's policy and required capabilities mutated the
  normalized definition/capability input and every later plan, while the
  definition digest stayed unchanged (`CWF-AUD-002`).
- Applying the SDK guard's own regular expression to source forms detected a
  normal `from` import and dynamic import but missed
  `import "@openai/codex-sdk"` and
  `require("@openai/codex-sdk")` (`CWF-AUD-005`).
- Full normalization accepted a condition pointer `/invalid/~2escape`; direct
  pointer probes also accepted a bare trailing `~` (`CWF-AUD-006`).

## 5. Resource-delta and immutability checks

Before and after all verification:

- no process matched the controlled Codex executable, built workflows CLI, SDK
  boundary/resume/abort roots, or singleton-alias probe;
- the only matching `/private/tmp` entry was the same pre-existing
  `codex-workflows-old-monitor-flush.json`;
- both workspace `.pi` hashes were identical;
- the 70-file candidate digest was identical;
- the candidate-file count remained 70; and
- `git status` had no new product, test, contract, plan, skill, `.pi`, or runtime
  file. This audit report is the sole persistent audit write.

## 6. Rubric axes

### Axis 1 — Contract and architecture fidelity

**POINT: 0**

Positive evidence: package ownership and the resolved Nx graph match the frozen
architecture; the app imports only `workflows`, the only current SDK source
import is the allowed adapter, and durable CLI commands fail closed.

The point is withheld because the singleton does not have immutable host
configuration or a protected conflict fingerprint (`CWF-AUD-001`), and the
planner permits post-digest mutation through returned aliases
(`CWF-AUD-002`). Those are direct failures of `SPEC.md` sections 4.3–5 and
`ARCHITECTURE.md` sections 3–5.

### Axis 2 — Behavior and BATDD evidence

**POINT: 0**

Positive evidence: fresh manifest-driven L1/L2/L3 execution is nonzero and
passes, the L2 boundaries are real child/filesystem boundaries, L3 runs the
built public CLI, machine artifacts are current, and the repository's
false-green testing policy selected 16 files.

The point is withheld because required standing targets genuinely fail at zero
selection (`CWF-AUD-003`) and historical RED-before-GREEN/freeze provenance is
available only as Markdown self-report, with no immutable candidate assignment
or registered machine artifacts (`CWF-AUD-004`). Current GREEN execution cannot
prove historical order or freeze.

### Axis 3 — Security, authorization, and recovery

**POINT: 0**

Positive evidence: path containment, symlink containment, file/byte/UTF-8
bounds, durable refusal, prompt redaction, abort/reap behavior, `.pi`
immutability, and resource cleanup passed the described attacks.

The point is withheld because caller mutation can change actual SDK child
configuration under a stale fingerprint and the public fingerprint can bypass
conflict rejection (`CWF-AUD-001`). Malformed JSON Pointer syntax also passes
admission (`CWF-AUD-006`).

### Axis 4 — Implementation and integration quality

**POINT: 0**

Positive evidence: the exact six-project affected closure passes fresh lint,
typecheck, applicable builds, aggregate tests, existing daemon boundaries, and
workspace synchronization. CLI output is deterministic for the canonical
example, SDK/runtime versions are pinned (`@openai/codex-sdk` and its bundled
CLI are 0.147.0), and the system/runtime difference is documented (system Codex
0.146.1, Node 24.15.0, Bun 1.3.14, Nx 23.1.0).

The point is withheld because the public singleton and planner APIs violate
their integrity contracts, four Nx layer targets are unusable, the SDK import
gate is not complete, and pointer validation is not standards-correct
(`CWF-AUD-001`, `002`, `003`, `005`, and `006`). This is not production-quality
integration for the bounded slice.

### Axis 5 — Documentation, operability, and skill quality

**POINT: 0**

Positive evidence: the global workflows skill is concise, discoverable, valid,
and its documented Nx plan command works. CLI/schema/examples largely match the
executable happy path.

The point is withheld because the reports are not reconciled with disk: the
handoff claims an immutable singleton, secret-free fingerprint behavior, no
actionable in-scope findings, and a passing exact-file format check. Direct
evidence disproves each relevant claim, and RED provenance remains report-only.
The reversed L2 section comments add a smaller operability inconsistency.

## 7. Findings, ordered by severity

### CWF-AUD-001 — CRITICAL — Mutable SDK configuration and diagnostics defeat singleton authority

**Material blocker:** yes.

**Evidence:**

- `packages/codex/src/runtime/adapter.ts:118`–`125` passes caller-owned
  `config.config` and `config.env` references into the SDK.
- `packages/codex/src/runtime/singleton.ts:45`–`69` fingerprints generic config
  values, including values that can contain credentials.
- `packages/codex/src/runtime/singleton.ts:119`–`125` exposes a mutable
  diagnostics object.
- `packages/codex/src/runtime/singleton.ts:348`–`360` uses that public mutable
  diagnostics fingerprint for conflict enforcement and passes the original
  config to the adapter factory.
- `packages/codex/src/runtime/types.ts:16`–`23` and `121`–`125` expose mutable
  nested configuration/diagnostic shapes at runtime.
- Fresh public-API/real-child probe:
  `{"mutatedOverrideReachedChild":true,"originalOverrideReachedChild":false,"fingerprintUnchanged":true}`.
- Fresh conflict probe:
  `{"diagnosticsMutable":true,"conflictBypassed":true,"conflict":null}`.
- A separate probe showed both config/env aliases and that changing a generic
  config value changes the diagnostic fingerprint.

**Impact:** initialization does not bind the SDK to an immutable configuration.
A caller can change future child arguments or environment after admission while
observability continues to assert the old fingerprint. A caller can also mutate
the public fingerprint to suppress `CODEX_HOST_CONFLICT`. Generic config values
can be credential-bearing, turning the diagnostic hash into a secret-dependent
oracle contrary to the non-secret fingerprint contract. This defeats the
boundary's core authorization/integrity purpose.

**Bounded repair acceptance:** snapshot and deep-freeze all host configuration
before fingerprinting and adapter construction; retain the authoritative
fingerprint in private immutable state; expose only a deeply immutable
diagnostic projection; define and enforce a non-secret fingerprint input that
cannot include credential-bearing config/environment values. Add adversarial
tests showing mutations of original config, nested config, env, and public
diagnostics cannot change an actual later child, cannot change or bypass the
conflict decision, and cannot make credentials influence diagnostics. Run the
real controlled-child L2 target uncached and prove zero resource delta.

### CWF-AUD-002 — HIGH — Plan output aliases normalized state across a fixed digest

**Material blocker:** yes.

**Evidence:**

- `packages/workflows/src/planning/planner.ts:237`–`247` returns
  `workflow.definition.policy` and `workflow.requiredCapabilities` by reference.
- `packages/workflows/src/normalization/normalize.ts:23`–`57` binds the digest
  once, then returns mutable definition/capability structures.
- Fresh public-API probe after mutating the first plan:
  `{"policyAliased":true,"capabilitiesAliased":true,"digestUnchanged":true,"secondPolicyCarriesMutation":true,"secondCapabilitiesCarryMutation":true}`.

**Impact:** planning is not a pure, integrity-preserving lowering boundary. A
consumer can mutate the plan and thereby mutate the supposedly normalized
source used by later plans while the bound definition digest remains unchanged.
That can misrepresent policy/capability requests to a future durable lowering
consumer.

**Bounded repair acceptance:** ensure normalized state and every returned plan
have no shared mutable references, at minimum deep-cloning or deeply freezing
policy/capability structures and other nested public values. Add a regression
that attempts mutation of all nested plan outputs, proves the normalized input
and a second plan remain byte/canonically identical, and proves digest-bound
state cannot diverge.

### CWF-AUD-003 — HIGH — Four canonical standing layer targets select zero tests

**Material blocker:** yes.

**Evidence:**

- `packages/codex/project.json:21`–`25` and `34`–`39` pass
  `src/**/*.test.ts` and `src/**/*.spec.ts` as Vitest positional filters.
- `apps/codex-workflows/project.json:98`–`102` and `120`–`126` do the same.
- Fresh uncached `codex:test-l1`, `codex:test-l2`,
  `codex-workflows:test-l1`, and `codex-workflows:test-l2` each exited 1 with
  `No test files found` and zero selection.
- Narrow exact-file targets and aggregate manifests passed, proving this is a
  target/harness defect, not proof that the underlying behaviors fail.
- `SPEC.md:216` explicitly names `codex:test-l2`; `SPEC.md:217` explicitly names
  `codex-workflows:test-l1`; repository TESTING law requires valid standing
  layer targets.

**Impact:** required user-facing acceptance commands do not execute evidence.
The aggregate manifests mask the defect by invoking exact test files directly.
This is a genuine required standing-gate failure and independently activates
the 3/5 score cap.

**Bounded repair acceptance:** correct all four commands using verified
package-root paths or runner configuration. Fresh uncached execution of every
standing L1/L2 target must exit 0, select the intended nonzero counts, execute
the correct files/layers, and produce no resource delta. Add an Nx-level policy
test that fails if these targets regress to zero selection.

### CWF-AUD-004 — HIGH — RED/freeze provenance is self-report only

**Material blocker:** yes.

**Evidence:**

- `rg --files .agents/batdd/assignments` returns only `G0.W1.json`, a terminal,
  non-dispatchable Ground-0 worker assignment for the testing harness.
- The evidence inventory for this feature contains five authored reports and
  current GREEN JSON outputs, but no immutable candidate assignment, registered
  RED artifact, reducer-approved event, or machine-readable RED result.
- `docs/reports/codex-workflows-implementation-report.md:93`–`105` and
  `docs/reports/codex-workflows-external-audit-handoff.md:62`–`67` are the only
  observed RED-count/provenance records. They are Markdown claims.
- Fresh current execution can establish GREEN and test sensitivity against new
  attacks, but it cannot establish the historical RED-before-GREEN order or
  freeze boundary.

**Impact:** the auditor cannot independently verify the required BATDD
provenance without accepting Markdown as proof, which the audit contract
forbids. This is an evidence gap, not an allegation that the described RED was
fabricated.

**Bounded repair acceptance:** furnish reducer-registered, immutable artifacts
bound to the exact frozen contract and relevant revisions, including nonzero
selected/executed counts, semantic failures, commands, exits, and cleanup
evidence. If historic evidence does not exist, do not backfill history in prose;
use a ratified recovery/re-proof procedure (for example, frozen-test fault or
mutation injection against the exact acceptance rows) and record its limits.

### CWF-AUD-005 — HIGH — SDK import exclusivity gate has false-negative syntax coverage

**Material blocker:** yes.

**Evidence:**

- `packages/codex/tools/check-sdk-imports.ts:19`–`24` recognizes only `from`
  imports and dynamic `import(...)`.
- `packages/codex/tools/check-sdk-imports.ts:30`–`35` always prints
  `selected: 1` when no recognized offender exists; it does not prove the
  allowed adapter import actually exists exactly once.
- Fresh grammar probe results:
  ordinary `from` import `true`; side-effect import `false`; CommonJS `require`
  `false`; dynamic import `true`.
- A separate source-only `rg` confirms current disk presently has exactly one
  real import at `packages/codex/src/runtime/adapter.ts:1`; the defect is in the
  claimed executable enforcement, not a current hidden second import.

**Impact:** a forbidden SDK dependency can enter another app/package through a
valid syntax form while the mandatory exclusivity gate reports success and a
fabricated selection count. This makes the gate false-green.

**Bounded repair acceptance:** parse import/module syntax or otherwise cover
static imports (including side-effect and type imports), dynamic imports,
re-exports, and supported `require` forms without comment/string false
positives. Prove the allowed adapter import exists exactly once and report the
actual selected occurrence/file count. Add adversarial fixture tests for every
covered form and allowed-file absence/duplication.

### CWF-AUD-006 — MEDIUM — Invalid JSON Pointer escapes pass workflow admission

**Material blocker:** yes.

**Evidence:**

- `packages/workflows/src/schema/validation.ts:302`–`310` blindly replaces
  `~1` and `~0` but never rejects any other `~` escape.
- Direct probes accepted `/invalid/~2escape` and `/invalid/~`.
- Full `normalizeWorkflow` accepted the canonical source after replacing its
  condition pointer with `/invalid/~2escape`.

**Impact:** the frozen contract promises safe JSON Pointers, but invalid RFC
6901 syntax is treated as a different literal key. Conditions/fan-out can be
validated and digested under ambiguous or nonportable addressing semantics.

**Bounded repair acceptance:** validate each pointer segment before decoding;
every `~` must be followed by `0` or `1`. Retain the prototype-pollution segment
denials after decoding. Add full-source tests for malformed escapes in
conditions, fan-out source pointers, and item-key pointers with stable issue
codes.

### CWF-AUD-007 — LOW — Exact candidate formatting check does not match the handoff

**Material blocker:** no; non-material follow-up.

**Evidence:** the exact candidate-file `bun nx format:check --stdin` exited 1 and
named `docs/reports/codex-workflows-sdk-architecture-report.md`, while
`docs/reports/codex-workflows-external-audit-handoff.md:91` says it passed.

**Impact:** documentation hygiene/evidence reconciliation is inaccurate, but
this alone would not block a commit if the material defects were absent.

**Bounded follow-up acceptance:** format the named report through the workspace
formatter, rerun the exact path set, and reconcile the handoff with the actual
command artifact.

### CWF-AUD-008 — LOW — CLI L2 section comments are reversed

**Material blocker:** no; non-material follow-up.

**Evidence:** `apps/codex-workflows/src/workflows/cli.spec.ts:15` labels the
following `[L2:E2E]` suite as real-boundary integration, while line 116 labels
the following `[L2:INTEGRATION]` suite as end-to-end. The suite/test titles and
Nx filters themselves classify and execute the intended two tests each.

**Impact:** this is a reviewer/operability inconsistency, not a demonstrated
layer-execution defect.

**Bounded follow-up acceptance:** align the two comments with their suite titles
without changing frozen scenario/test titles or assertions.

## 8. Material blockers versus non-material follow-ups

Material repair blockers:

- `CWF-AUD-001`
- `CWF-AUD-002`
- `CWF-AUD-003`
- `CWF-AUD-004`
- `CWF-AUD-005`
- `CWF-AUD-006`

Non-material follow-ups:

- `CWF-AUD-007`
- `CWF-AUD-008`

The unrelated pre-existing Ajv strict-schema compilation mismatch in
`.agents/batdd/profile.schema.json` is recorded as baseline context and is not a
candidate finding.

## 9. Score arithmetic and cap application

| Axis                                          |   Point |
| --------------------------------------------- | ------: |
| Contract and architecture fidelity            |       0 |
| Behavior and BATDD evidence                   |       0 |
| Security, authorization, and recovery         |       0 |
| Implementation and integration quality        |       0 |
| Documentation, operability, and skill quality |       0 |
| **Raw total**                                 | **0/5** |

Arithmetic: `0 + 0 + 0 + 0 + 0 = 0`.

Cap analysis:

- `CWF-AUD-001` is a critical authority/integrity violation.
- `CWF-AUD-003` is a genuine failure of required standing/live gates.
- `CWF-AUD-001` through `CWF-AUD-006` require material repair before a
  responsible commit.

The canonical score is therefore capped at 3/5. Applying the cap to the raw
0/5 score leaves **0/5**.

## 10. Recommendation and independence statement

Do not commit the current candidate. Repair only the bounded findings above,
preserve the frozen behavior rows, recapture fresh nonzero standing and
aggregate evidence, furnish legitimate immutable RED/re-proof provenance, and
send the exact repaired dirty candidate to a fresh independent auditor.

This report is independent verification and judgment, not implementation. I did
not repair product code, tests, contracts, plans, skills, existing reports, or
`.pi`; I did not commit, stage, push, merge, publish, deploy, or mutate the Agent
Wiki. This report is my only authorized persistent write.

FINAL_SCORE: 0/5
VERDICT: REPAIR_REQUIRED

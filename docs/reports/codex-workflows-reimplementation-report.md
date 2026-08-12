# Codex Workflows Reimplementation Report

> **Attempt 1 reconciliation (2026-08-08):** The independent
> `codex-workflows-external-audit-attempt-1.md` found that the RED account in
> this implementation-agent report was not backed by registered immutable
> historical artifacts and also identified material findings `CWF-AUD-001`
> through `CWF-AUD-006`. The original account remains visible as self-report;
> it is not backdated or reclassified. Present-day bounded recovery evidence is
> recorded separately in `codex-workflows-repair-attempt-1.md` and carries no
> independent verdict.

> **Attempt 2 reconciliation (2026-08-08):** The independent Attempt 2 audit
> supersedes any current-candidate closure implication in this historical
> implementation report for `CWF2-AUD-001` through `003`. The successor repair
> restores full private SDK-host admission equality, proves actual exhaustive
> standing selection, and preserves zero-selected evidence as zero. See
> `codex-workflows-repair-attempt-2.md`; this report remains self-report only.

**Campaign:** `CDX-WF-2026-08-07`  
**Repair basis:** the five findings in `docs/reports/codex-workflows-self-audit-report.md`  
**Candidate basis:** repository `HEAD` `28c4650c676644bdfac11aa25c46d5be9b15f833` plus the current campaign working tree  
**Role boundary:** bounded self-audit repair evidence only; this is not independent verification or acceptance

## Outcome

All five actionable in-scope self-audit findings are repaired without widening
the frozen feature scope or adding a durable authority. The original Green
Contract assertions remain unchanged. Four new workflow assertions and three
new Codex observation assertions were added as an explicit repair successor.

The additive repair contract digest is
`sha256:12e1209800364b1bf48e071623d4ccf5f3eed15d6d981a9fad1b50ffa0e25f30`.
It covers the original native/scenario contracts, the two new repair test
files, and the exact project/aggregate test selections. The subsequent Nx
format pass did not change that digest.

## Meaningful repair RED

Both repair targets were run uncached after the new assertions existed and
before their product implementation:

```text
bun nx run workflows:test-l1-integration --outputStyle=static --skipNxCache
  7 selected: 3 pre-existing passed; 4 repair tests failed
  SA-001: workflow incorrectly accepted a conditional branch with no join
  SA-002: planned nodes lacked all three requested lowering fields
  SA-003a: 5,120-node expansion was incorrectly accepted
  SA-003b: legacy projection returned 262 claims instead of bounded 256

bun nx run codex:test-l1-integration --outputStyle=static --skipNxCache
  7 selected: 4 pre-existing passed; 3 repair tests failed
  SA-004: the observation sink remained empty for success, early return, and failure
```

These were semantic failures after imports and fixtures loaded. There was no
syntax error, missing harness, zero-test pass, no-op assertion, or lower-layer
test invocation.

## Bounded GREEN repairs

### SA-001 — explicit conditional convergence

Graph validation now traverses dependency edges from every conditional step and
requires a reachable explicit `join`. An absent join returns stable issue
`CONDITIONAL_JOIN_REQUIRED`. The existing condition/fan-out/join fixture
remained valid, so the rule does not reject a branch that reconverges after
intermediate work.

### SA-002 — per-node lowering requests

Every planned node now owns a cloned `policyRequest` and a bounded
`capabilityRequest`. Task and fan-out nodes also own a redacted
`handlerRequest`: registered handlers expose their registry name; Codex handlers
expose model and canonical prompt digest. Raw prompts never enter a plan.
Expanded fan-out instances receive the same explicit request contract as their
source step.

### SA-003 — planning and legacy projection bounds

Planning rejects aggregate expansion beyond 4,096 nodes with
`PLAN_NODE_LIMIT_EXCEEDED`, independently of each fan-out's 1,024-item limit.

The pure `.pi` parser now enforces the same 8 MiB ceiling as the CLI loader,
4,096 task/event records, task nesting depth 64, bounded identifiers and
diagnostic text, and at most 256 historical claims of 4,096 characters. Claims
that exceed the text limit are deterministically truncated; claims beyond the
count limit are omitted. `truncatedClaims` reports both cases, while
`sourceDigest` continues to cover the unmodified original bytes.

### SA-004 — secret-safe Codex observations

The process-local host accepts an optional non-persistent observation callback.
Buffered and streamed operations emit one owned observation with operation,
completion/failure/abort/consumer-return outcome, duration, thread ID,
deduplicated owned event types, usage, safe requested/effective option fields,
SDK version, and secret-free configuration fingerprint.

Raw prompts, working-directory values, API keys, environment values, and raw
adapter errors are excluded. Observer exceptions are swallowed and cannot
change SDK operation semantics. The callback owns no cache, queue, retry,
verdict, or durable process state.

### SA-005 — documentation reconciliation

The root `README.md` now distinguishes Wiki-governed target architecture from
current implementation inventory and lists all six resolved Nx projects. The
architecture file maps now match the compact source layout, and workflow/CLI
documentation records conditional convergence, per-node requests, aggregate
node limits, and legacy truncation reporting.

## Repair GREEN and regression evidence

Immediate uncached GREEN:

```text
workflows:test-l1-integration  7/7 passed (4 repair + 3 original)
codex:test-l1-integration      7/7 passed (3 repair + 4 original)
workflows:lint                 passed
workflows:typecheck            passed
codex:lint                     passed
codex:typecheck                passed
```

Uncached aggregate regression:

| Project                               | Result                                                                                                                 |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `@orchestration/workflows:test`       | 10 L1 unit + 7 L1 integration passed; pure-boundary L2/L3 N/A reasons retained.                                        |
| `@orchestration/codex:test`           | SDK import guard selected exactly one allowed import; 4 L1 unit + 7 L1 integration + 4 real-SDK L2 integration passed. |
| `@orchestration/codex-workflows:test` | Build passed; 6 L1 unit + 2 L2 integration + 2 L2 E2E + 3 L3 scenarios/13 steps passed.                                |

The real SDK boundary still spawned and reaped the controlled executable. CLI
tests still proved fail-closed durable commands, source/input and `.pi`
immutability, and guaranteed temporary-directory cleanup.

Machine result paths remain:

- `test-output/codex-workflows/workflows.json`
- `test-output/codex-workflows/codex.json`
- `test-output/codex-workflows/codex-workflows.json`
- `test-output/cucumber/codex-workflows.json`

## Remaining architecture boundary

There is still no ratified durable process/delivery/transport implementation in
this repository candidate. The CLI continues to return exit 69 before source
loading or SDK initialization for durable commands. No daemon, reducer, queue,
retry authority, monitor, tmux transport, database, or local run-state
substitute was added during repair.

## Final repair closure

The final explicit affected command selected all six projects plus two
dependency tasks and passed uncached in 9.5 seconds:

```text
bun nx affected -t lint,typecheck,build,test \
  --files=bun.lock,tsconfig.json,README.md,SPEC.md,ARCHITECTURE.md,PLAN.md,packages/workflows/src/lib/repairs.test.ts,packages/workflows/src/planning/planner.ts,packages/codex/src/runtime/observability.test.ts,packages/codex/src/runtime/singleton.ts,apps/codex-workflows/src/main.ts,packages/testing/src/ground-zero/harness.spec.ts \
  --outputStyle=static --skipNxCache --parallel=3
```

It included 16 passing test-policy selections, the one-file SDK import guard,
20 passing/2 skipped Ground-0 L2 tests, all repaired package aggregates, the
controlled SDK process boundary, and both Cucumber suites. `bun nx sync:check`
and the exact campaign-file `bun nx format:check --stdin` passed. Both preserved
`.pi` SHA-256 values were unchanged, no controlled Codex process or matching
temporary residue remained, and both executables retained mode `755`.

The global `workflows` skill passed the canonical skill-creator validator; all
nine referenced paths resolved, its read-only CLI examples returned their
documented exits, and package exports loaded from their owning/consumer package
contexts. Full closeout evidence is in the external-audit handoff. This report
neither certifies the candidate independently nor grants acceptance.

# Codex Workflows direct TypeScript runner self-audit

**Auditor:** the same fresh implementation identity  
**Date:** 2026-08-08  
**Current-disk candidate:** 92 included paths,
`sha256:1d4c09fd9657bb4aa9c020b785deb6a9bfb4c097bcdffea4559000daa1c436ef`  
**Machine evidence:**
`packages/testing/evidence/codex-workflows-ts-runner-reproof.json`, SHA-256
`40398729a62e3c4ce195d935e1b3e55a5a2819087804c425b123d90a885dfd20`  
**Independence:** none; this is a hostile implementer self-review, not external
verification or judgment

## Self-audit conclusion

I found no known unresolved in-scope behavior blocker after the final repair
and replay cycle. The candidate is suitable for external audit, subject to the
limitations below. This conclusion is not independent acceptance and does not
adopt either prior auditor's score as authority.

## Authority and preservation review

- The Founder direct-TypeScript settlement and later Luna-only override control
  the current semantic contract.
- The local runner remains explicitly separate from Wiki-governed PostgreSQL,
  reducer, pg-boss, daemon, monitor, and tmux durable authority.
- No commit, stage, push, publish, deploy, shell configuration, Wiki mutation,
  database write, or destructive worktree cleanup occurred.
- `.pi` hashes remain:
  - `b286b4a30a1fecd9181b2931404b2995a0eb3dbd4862f75f82a17e38a439e300`
    for `.pi/goals/goal_events.jsonl`;
  - `1a1fac4047a1795f706cf2eab13030e322f54d959f560ca20e3446b620d49b64`
    for the archived goal note.
- External Audit Attempt 1 remains
  `7e3f5753651b7887476dc562c453fb96ded8e9a7993f827a2f46e30828a4ed46`.
- External Audit Attempt 2 remains
  `06f41544f043f323163f086aa92ee315114df7a3613cc4e11178fed2d89aaf7e`.
- Old reports and live journals are treated as immutable history, not silently
  revised present-day proof.

## Requirement attack matrix

| Requirement                             | Evidence and adversarial review                                                                                           | Result |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------ |
| Exact shebang/interpreter               | Exact first-line admission, root/regular/extension/UTF-8 checks, real kernel E2E, literal live dogfood, normal PATH link  | PASS   |
| No user-visible loader/compile artifact | Internal esbuild OS-temp bundle; temp removed; no authored JS/JSON prerequisite                                           | PASS   |
| Bare and explicit execution             | Parser unit plus real bare, explicit `run`, and shebang process tests                                                     | PASS   |
| Typed API                               | Export/typecheck/freeze tests for all six public functions                                                                | PASS   |
| Concurrent shape                        | Record and array gate tests plus controlled/live overlapping siblings                                                     | PASS   |
| Actual value dataflow                   | In-process exact object assertion, controlled consolidator private-input trace, live two-dependency/distinct-input digest | PASS   |
| Model/reasoning/schema                  | Controlled real SDK argv and live child/journal prove exact Luna/medium and schema forwarding                             | PASS   |
| Stable prelaunch node state             | Frozen event precedes start; journal has stable ID, dependencies, model/reasoning, digests, and timing                    | PASS   |
| Redaction                               | Unit injection of prompt/input/env/raw error, controlled secret probes, live probe search                                 | PASS   |
| Failure/cancellation/cleanup            | First failure, queued suppression, sibling abort, schema exit 68, SIGINT 130, PID reaping, host drain                     | PASS   |
| Journal/artifact integrity              | Atomic write/rename, path traversal rejection, bounded names/bytes/events/nodes, digest match, no temp residue            | PASS   |
| SDK import exclusivity                  | Syntax-aware scan selected one allowed import and zero offenders                                                          | PASS   |
| JSON compatibility                      | Locked L1/L2/L3 and normal-PATH validate/inspect/plan/dry-run/import remain GREEN                                         | PASS   |
| Durable honesty                         | JSON run and run-ID controls remain exit 69; docs reject local durable claims                                             | PASS   |
| Luna-only override                      | Static exact-set test, no forbidden launch-surface search hits, controlled SDK traces, live Luna/Luna/Luna                | PASS   |
| Docs/skill                              | All named docs reconciled; global skill validator passes                                                                  | PASS   |
| Nx/workspace hygiene                    | Graph edges, lint, typecheck, build, aggregates, affected closure, sync, format, policy pass                              | PASS   |

## Findings discovered and resolved

### SA-TS-001 — SDK packaging broke live host initialization

The first live attempt failed in two milliseconds before any agent. Bundling
the SDK through the app had rewritten its `import.meta.url`, so its
`createRequire` lookup could not resolve the pinned Codex executable.

Resolution: emit `packages/codex` as its own ESM runtime, externalize it from
the app bundle, and make app build depend on `codex:build`. Controlled SDK
tests, app build, and live dogfood then passed. The failed journal remains
historical.

### SA-TS-002 — Shared abort signal caused SDK abort-listener behavior

Early controlled failure exposed an SDK-boundary issue when multiple sibling
turns shared one signal directly.

Resolution: create a per-operation abort controller relayed from the scheduler
controller, remove the relay listener in `finally`, abort active siblings, and
reject queued siblings. Controlled failure, cancellation, and cleanup tests now
pass with zero child residue.

### SA-TS-003 — TypeScript dry-run falsely implied no local effects

The first renderer reused the JSON `sideEffects: []` projection even though
importing trusted TypeScript can run top-level code.

Resolution: TypeScript dry-run now reports
`inspectionEffects: ["trusted-typescript-module-load"]`, zero agent launches,
no SDK initialization, and no durable writes. All documentation calls out this
boundary.

### SA-TS-004 — Journal node projection lacked explicit start/end fields

Events carried timestamps, but the node projection initially kept only
`updatedAt` and duration.

Resolution: node-start events project `startedAt`; terminal events project
`completedAt`, outcome, duration, output digest, and safe diagnostic. The live
journal proves all fields.

### SA-TS-005 — Founder override invalidated the original model matrix

The frozen candidate and contract originally used a Sol consolidator/schema
path. A pre-override dogfood was active with two Luna researchers when work was
interrupted; inspection proved the Sol consolidator had not launched.

Resolution: preserve the original contract digest, hashes, RED/GREEN, and
journals as historical; add/freeze `TS-GC2-016`; capture one meaningful RED
with zero agents; reconcile every launch-capable test/example/skill surface to
Luna/medium; run a new real Luna/Luna/Luna dogfood.

### SA-TS-006 — Hygiene and classification fixture defects

Full gates found two empty no-op event methods, one unused policy helper, and a
missing L2 ownership marker. The formatter later made a mechanical change.

Resolution: no-op callbacks explicitly return undefined, the helper was
removed, the L2 marker was added, and Nx formatting was applied. The contract's
post-freeze ledger records every hash successor. Testing policy, typecheck,
lint, the exact policy test, and all aggregates replay GREEN.

## Security and confidentiality review

The strongest boundary is admission plus explicit trust, not isolation.
`realpath`, root containment, regular-file checks, exact shebang, byte limits,
temporary-module cleanup, default-export validation, and fail-closed error
mapping reduce accidental execution. They do not make arbitrary TypeScript
safe.

The runner intentionally forwards private prompt plus actual serialized input
to the SDK. Neither enters workflow public events or journal records; only
digests do. The SDK observation boundary similarly excludes prompt/path/env
values and raw errors. Artifact values and final output are explicitly
user-declared outputs and can be sensitive.

The current agent host policy is workspace-write, network/web live, approval
never, and the invocation working directory. This was necessary for official
source research and is not configurable through the minimal public agent API.
It is documented as an execution-risk boundary rather than hidden.

## False-green review

- Every test target has nonzero selection; testing policy verifies 21 files and
  seven standing targets.
- L3 step definitions execute the built public boundary and do not call L1/L2
  targets or import their test entrypoints.
- Controlled SDK tests use the real pinned SDK and a controlled executable, not
  a mocked adapter.
- Literal shebang E2E uses kernel dispatch and PATH resolution.
- The live run used neither direct Codex CLI orchestration, tmux agents, mocks,
  nor a JSON-only planner.
- Original RED preserved prior GREEN counts; override RED selected only the new
  policy check and launched zero agents.
- Intermediate false failures from wrong JSON traversal, type-union regex,
  lint, classification, and formatting are recorded as fixture/hygiene work,
  not product RED.
- Aggregate artifacts report honest selected counts and status; zero/N/A
  layers remain explicit.

## Graph and package review

Resolved Nx project graph:

```text
workflows -> []
codex -> []
codex-workflows -> [workflows, codex]
```

There is no package-to-app edge, workflow-to-Codex edge, or new durable-domain
edge. The application imports only public package barrels. The SDK scan sees
exactly one static value import at
`packages/codex/src/runtime/adapter.ts:1:1`.

## Resource and state review

Final resource probes found:

- controlled Codex children: 0;
- built app CLI children: 0;
- live dogfood runner: 0;
- internal TypeScript temporary directories: 0;
- workspace direct-runner temporary roots: 0;
- completed live journal temporary files: 0.

Only the existing Nx daemon build output remains under workspace `tmp/`.
Diagnostic manual-run temporary files created during implementation were
removed by exact path; no user/runtime tree was recursively cleaned.

The intended new external state is limited to the Bun package link, reconciled
global workflow skill, and three local workflow run directories. The completed
run is authoritative only as local operational evidence.

## Remaining limitations and external-audit targets

1. A malicious or mistaken TypeScript module can run arbitrary top-level local
   code during every TypeScript command, including inspection.
2. Agent sandbox/network/approval settings are fixed at the current local host
   policy rather than authored per agent.
3. Per-run storage is bounded, but total run retention is not automatically
   pruned.
4. Abrupt unhandled process death can leave a journal at `running`; the
   deliberately preserved pre-override journal demonstrates this.
5. Local run IDs provide no cross-process control or recovery. Durable verbs
   correctly fail closed.
6. Static plan/dry-run cannot enumerate a dynamic callback graph without
   executing it.
7. The real dogfood verifies model acceptance and behavior at one point in
   time; backend availability can change and no fallback is allowed.
8. This audit reused the implementation identity. A fresh external auditor
   must attack the exact candidate and machine evidence independently.

## Implementer verdict

All required in-scope behavior and validation known to this identity is GREEN,
with limitations disclosed and historical evidence preserved. The next valid
state is external audit—not acceptance.

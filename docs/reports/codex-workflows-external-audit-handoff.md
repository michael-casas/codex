# Codex Workflows External-Audit Handoff

**Campaign:** `CDX-WF-2026-08-07`  
**Candidate basis:** repository `HEAD` `28c4650c676644bdfac11aa25c46d5be9b15f833` plus the current uncommitted/untracked campaign working tree  
**Handoff meaning:** implementation-agent readiness for a fresh external audit; not Preflight proof, an independent verdict, Judge approval, or acceptance

> **Attempt 1 reconciliation (2026-08-08):** This historical handoff and its
> final readiness marker are preserved as the implementation agent's original
> self-report. The independent
> `codex-workflows-external-audit-attempt-1.md` subsequently scored the
> candidate `22/100` and identified material findings `CWF-AUD-001` through
> `CWF-AUD-006`; it is not superseded or erased. Current bounded repair evidence
> belongs to `codex-workflows-repair-attempt-1.md`. In particular, the original
> RED narrative below was not registered as immutable historical evidence and
> is not retroactively promoted by the recovery re-proof.

> **Attempt 2 reconciliation (2026-08-08):** The independent Attempt 2 audit
> subsequently scored its exact candidate `0/5` and opened material findings
> `CWF2-AUD-001` through `004`. This handoff's historical readiness language is
> not current evidence. Failed-only product repair for `001` through `003` is
> recorded in `codex-workflows-repair-attempt-2.md`; `004` remains a mandatory
> fresh independent Preflight over the exact final candidate.

## Outcome

The approved read-only Codex Workflows vertical slice is implemented,
documented, self-audited, repaired, and validated. No actionable in-scope
self-audit finding remains. The candidate stops at the external-audit boundary
and does not claim independent certification.

Implemented surfaces:

- `@orchestration/workflows`: strict version-1 source/input validation,
  dependency and conditional-join rules, recursive normalization, canonical
  SHA-256 digests, deterministic bounded planning, node-local lowering
  requests, and read-only bounded `.pi` parsing.
- `@orchestration/codex`: the sole production `@openai/codex-sdk` import,
  exact SDK/runtime pin `0.147.0`, immutable process-local singleton,
  lifecycle draining, same-thread admission, buffered/streamed turns,
  controlled process integration, and secret-safe non-persistent operation
  observations.
- `@orchestration/codex-workflows`: executable bundled ESM CLI for
  `validate`, `inspect`, `plan`, `dry-run`, and `import-pi`; durable command
  vocabulary fails closed with exit 69 before source loading or SDK
  initialization.
- Global `/Users/mcasa_atlantis/.codex/skills/workflows`: concise router skill,
  three one-level references, and generated `agents/openai.yaml`.

No daemon, process reducer, delivery queue, retry authority, monitor, tmux
transport, database, or local run-state substitute was added. The existing
daemon remains a scaffold and is not represented as an accepted control-plane
protocol.

## Required reports

1. Implementation evidence:
   `docs/reports/codex-workflows-implementation-report.md`
2. Self-audit findings:
   `docs/reports/codex-workflows-self-audit-report.md`
3. Bounded reimplementation/repair evidence:
   `docs/reports/codex-workflows-reimplementation-report.md`
4. External-audit handoff:
   `docs/reports/codex-workflows-external-audit-handoff.md`

The completed architecture research remains at
`docs/reports/codex-workflows-sdk-architecture-report.md` and was preserved.

## Contract and RED→GREEN provenance

Green Contract: `CDX-WF-GC-1` in `SPEC.md`.

- Original RED contract:
  `sha256:a4c44d308a6729f0a1fc3602166a3863c2de700aa700e0d31923bca945973f58`.
- Mechanical-format successor with no semantic change:
  `sha256:98c570252a6a3159f1fbd492399ccebd4876787207426b9aba669ba03f85076f`.
- Additive self-audit repair contract:
  `sha256:12e1209800364b1bf48e071623d4ccf5f3eed15d6d981a9fad1b50ffa0e25f30`.

Every original L1/L2/L3 row produced a compiling, nonzero, semantic RED before
GREEN. The repair contract then produced seven additional semantic failures:
four workflow failures with three original tests still green, and three Codex
observation failures with four original tests still green. The narrow repairs
made all fourteen selected integration tests green without weakening an
original assertion or scenario.

## Final validation

The final affected closure was explicit and uncached:

```text
bun nx affected -t lint,typecheck,build,test \
  --files=bun.lock,tsconfig.json,README.md,SPEC.md,ARCHITECTURE.md,PLAN.md,packages/workflows/src/lib/repairs.test.ts,packages/workflows/src/planning/planner.ts,packages/codex/src/runtime/observability.test.ts,packages/codex/src/runtime/singleton.ts,apps/codex-workflows/src/main.ts,packages/testing/src/ground-zero/harness.spec.ts \
  --outputStyle=static --skipNxCache --parallel=3
```

Nx selected all six projects and two dependency tasks. All lint, typecheck,
applicable build, and aggregate targets passed in 9.5 seconds.

| Surface            | Final evidence                                                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Workflow L1        | 10 unit + 7 in-process integration tests passed.                                                                                  |
| Codex L1/L2        | 4 unit + 7 in-process integration + 4 real-SDK integration tests passed.                                                          |
| CLI L1/L2/L3       | 6 unit + 2 real-boundary integration + 2 E2E tests + 3 scenarios/13 steps passed.                                                 |
| Existing workspace | Daemon unit/L2, daemon-e2e, and testing aggregates passed; Ground-0 L2 reported 20 passed/2 skipped.                              |
| Test policy        | 16 selected checks passed.                                                                                                        |
| SDK imports        | Exactly one production import, allowed only at `packages/codex/src/runtime/adapter.ts`.                                           |
| Workspace sync     | `bun nx sync:check` reported all files up to date.                                                                                |
| Formatting         | Exact campaign-file `bun nx format:check --stdin` passed.                                                                         |
| Skill              | Canonical `quick_validate.py` reported `Skill is valid!`; only `SKILL.md`, `agents/openai.yaml`, and three reference files exist. |

Current machine artifacts:

- `test-output/codex-workflows/workflows.json` — passed
- `test-output/codex-workflows/codex.json` — passed
- `test-output/codex-workflows/codex-workflows.json` — passed
- `test-output/cucumber/codex-workflows.json` — 3 scenarios/13 steps passed

## Dogfood, public surfaces, and security

The built `apps/codex-workflows/dist/main.js` has executable mode `755`, begins
with exactly one Node shebang, and runs directly. Canonical validate, inspect,
plan, and dry-run examples returned exit 0 with stable definition digest
`sha256:fdc34332585f8d3ca5ebc768b2dd090997c4897bcf9ba89d2cccc190ad3bb884`;
the plan contains seven deterministic nodes. Dry-run reports `sideEffects: []`,
`sdkInitialized: false`, and `durableWrites: 0`.

Read-only `.pi` event import returned exit 0 and source digest
`sha256:b286b4a30a1fecd9181b2931404b2995a0eb3dbd4862f75f82a17e38a439e300`.
A nonexistent durable `run` source still returned exit 69 and
`CONTROL_PLANE_UNAVAILABLE`, proving refusal precedes source I/O.

All nine global-skill reference paths resolved. The workflow package example
loaded through the real `@orchestration/workflows` consumer link and produced
the canonical digest/seven-node plan. The Codex barrel exposed
`initializeCodexHost`, `shutdownCodexHost`, and `resetCodexHostForTests` from
its owning package context. No root dependency was added merely to make an
ad-hoc root import resolve.

Security/authority checks retained JSON-only source loading, realpath/cwd
containment, source/input/legacy byte ceilings, strict Ajv 2020 validation,
remote/executable schema rejection, graph and recursion bounds, aggregate
4,096-node planning, redacted Codex prompt digests, bounded legacy diagnostic
claims, secret-free singleton fingerprints/observations, read-only `.pi`, and
fail-closed durable commands.

## Resource and repository hygiene

Before and after final live validation:

- `.pi/goals/goal_events.jsonl` remained
  `b286b4a30a1fecd9181b2931404b2995a0eb3dbd4862f75f82a17e38a439e300`;
- `.pi/goals/archived/goal_2026071612024695_mrn48esr-mggbiz.md` remained
  `1a1fac4047a1795f706cf2eab13030e322f54d959f560ca20e3446b620d49b64`;
- no controlled Codex child process remained;
- no matching Codex SDK/workflows temporary residue remained;
- the CLI and controlled test executable retained mode `755`;
- unrelated ignored runtime files and the untracked `.pi/` tree were left in
  place.

The exact tracked/untracked status was reviewed. No commit, merge, push,
publish, deployment, destructive Git operation, worktree cleanup, Wiki write,
or `.pi` mutation occurred.

## Honest limitations for the external auditor

- Durable commands are deliberately unavailable because no accepted process
  protocol exists in this candidate. Exit 69 is part of the frozen contract.
- The SDK boundary uses the real installed SDK with a controlled local Codex
  executable; it does not make a paid/networked OpenAI turn.
- The package-pinned SDK/runtime is 0.147.0 while the separately installed
  system Codex CLI is 0.146.1; equivalence is not claimed.
- The named global `data-substrate` skill/scratchpad initializer was absent from
  configured skill roots. The campaign recorded that boundary and did not
  invent a database or expose service credentials.
- This implementation agent cannot independently verify or judge its own work.
  A fresh external audit must assess semantic completeness and issue any actual
  acceptance verdict.

READY_FOR_EXTERNAL_AUDIT

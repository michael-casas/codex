# CAS-MEADOW-RECOVERY-R3 — READY-FOR-REVIEW

Worker evidence only; not independent acceptance or a live recovery claim.

- Draft PR: https://github.com/michael-casas/codex/pull/7
- Target: `CAS/integration`; branch: `CAS/CAS-BASE_meadow-recovery`.
- Base: `4d001ccf5a40601df1504436b9fc6b66e50a0fab`.
- Product commit: `baf5729c2608473f94e3c91a0f113f0c63645735`.
- This document and the two evidence projections are the subsequent documentation commit.
- No merge authority exercised. No live migration, deployment or original workflow launch.

## Delivered behavior

The executor read its prior state from the submission stream even though terminal
events and runtime bindings were written to the runtime stream. It now reads the
correct history before dispatch or dead-letter finalization. Attempt identity is
recorded before acquisition and advances from persisted attempt numbers. Distinct
runs use distinct execution-scoped lease identities, while same-run retries
recover only exact owned markers, directories, Git metadata and revisions. Bound
ambiguous attempts retain their workspace for reconciliation instead of losing
it during cleanup. Cleanup failures have separate safe diagnostics and cannot
mask a primary setup failure; the viewer projection preserves terminal status.

Authenticated Control admission persists coordinator ownership. The additive
`008_coordinator_ownership.sql` models coordinator principals separately from
runtime recipients. Delegation binding captures actual provider identities;
workflow binding captures the actual host/thread. Missing session IDs remain
absent. Messaging translates `control:message` only after authenticated sender
equality and authoritative recipient ownership, with a transactional recheck and
SQL guard. Historical unowned records fail closed. The shared daemon actor/token
is not distinct Desktop-task authentication. Durable outbox, replay and correlation
rules remain in force.

The original Meadow pre-step exception was not independently observed from live
runtime evidence. Reproduced defects and faithful boundary fixtures establish the
repair's behavior; they do not establish the precise historical cause of R2.

## Verification evidence

- Frozen contract: `.agent/CAS-MEADOW-RECOVERY-R3-GC1.json`.
- Evidence index: `.agent/CAS-MEADOW-RECOVERY-R3-EVIDENCE.json`.
- Retained reports and hashes: `.agent/meadow-r3-evidence/` (ignored, local).
- Meaningful initial RED: 8 L1 tests, 2 L2 tests and 2 L3 scenarios. Two bounded
  supplements reproduced dropped diagnostic visibility and premature release of
  a bound ambiguous attempt before their fixes. Frozen assertions were retained;
  formatting, explicit no-op returns and fixture guards were plumbing changes.
- Exact product-commit GREEN: `bun nx run @codex/daemon:test-meadow-l1` — 10 tests;
  `test-meadow-l2` — 4 tests; `test-meadow-l3` — 2 scenarios. JSON reports are
  retained. The additional ownership/compatibility L2 checks are post-GREEN
  characterization, not claimed as pre-implementation RED rows.
- `bun nx affected -t test-l1 --base=4d001ccf5a40601df1504436b9fc6b66e50a0fab --parallel=3`
  — 324 tests across 12 projects passed. Subsequent focused daemon L1: 32 passed.
- Affected lint/typecheck/build: 17 projects passed. Final daemon build/typecheck
  and Git-hook affected gates passed after later bounded edits.
- `@codex/db:test-l2` — 13 tests passed.
- `@codex/transport:test-l2` — 13 tests passed with the required 0.151 CLI prefix.
- Test policy: 122 selected files, 13 standing targets, passed. Bun 1.4.2;
  Conventional Commit and Git hooks enabled. Three non-fatal lint warnings remain
  (two pre-existing test assertions and one fixture assertion).
- Paid-provider standing suites were inspected and excluded because no paid-turn
  admission exists. No real model turns were launched by this worker. Fresh
  verification/live dogfood remain coordinator-owned.
- GitHub CI was in progress when this handoff was prepared; see PR checks for
  authoritative current status.

## Meadow safe resume

The permitted origin `submission-status.json` records R2
`workflow_4a092851858c07c3c59dceb226ac04e39d2a2524c3a4838d8617b4bb438b19c5`
as terminal failed with `delivery-exhausted`; no documents were exported. The
coordinator previously verified both R1 and R2 terminal at cursor 12992. This
worker did not independently refresh live status.

After fresh verification, apply migration 008 after 001–007, deploy the repaired
daemon, and reconcile retained lease/resource custody. Then intentionally submit
corrected source with `multi-brand-guide-20260908-quiet-meadow-r3`, retaining host
`local-demo` and repository `michael-casas-quiet-meadow-96158642`. R1/R2 keys cannot
produce a new intentional run; terminal history is preserved. New post-fix R3
admission establishes ownership for its new agents; old agents are not adopted.
The recorded source correction already uses approved original paths and retains
`control://` artifact URIs only as archive provenance. No new Meadow source edit
is required for that correction. Do not launch R3 before the prerequisites.

The existing Meadow viewer is
http://127.0.0.1:4765/workflows/workflow_4a092851858c07c3c59dceb226ac04e39d2a2524c3a4838d8617b4bb438b19c5
(as recorded by origin, not reopened here). The coordinator owns this worker's
viewer, monitor, messages, deployment and FIX_READY. No mobile link was verified.

## Custody and checkpoint

Canonical checkout/config, Meadow files, original leases, terminal histories and
the pre-existing untracked `.codex-workspace-lease.json` were preserved. Only the
permitted Meadow status file was read; no transcript was read. All generated
fixture databases/roles, test listeners and temporary Git repositories were
closed. One initial L3 fixture cwd error occurred before fixture return; its exact
owned database `codex_control_test_1389_1788919407739_58029714` was removed after
identity verification. No existing user resource was deleted.

Dependencies, build caches and ignored evidence remain in this isolated worktree.
The local `origin` points to the canonical checkout and was not pushed. The
`delivery` remote points to the verified GitHub repository.

SQLite: `.agent/sqlite/session-01a083e1-47a0-7f72-8c6d-c18336624edc.db`, durable
rows 1–4 at handoff preparation; row 4 records the product commit and PR. All
survive compaction; read-back and `PRAGMA integrity_check` returned `ok`. A final
checkpoint row records the documentation commit and stop boundary after push.
The SQLite database remains uncommitted.

Ready-condition candidate: independent verification confirms owned coordinator
messages, adversarial no-write guarantees, distinct-run lease custody, same-run
reconciliation, preserved terminal history and safe diagnostics on this exact
candidate. Deployment then enables a deliberate fresh R3. No implementer gavel.

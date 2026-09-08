# CAS-03 Goal Charter — Durable Control Foundation

**Model:** `gpt-5.6-sol`, medium reasoning  
**Role:** Base owner for process/DB/delivery/daemon foundation  
**State:** allocated; dependency-gated by CAS-00  
**Terminal:** `CONTROL_FOUNDATION_READY`, `READY-FOR-AUDIT`, or an exact dependency halt

## Objective

Establish the smallest durable orchestration foundation: immutable commands/events and artifacts in PostgreSQL, deterministic projection reduction, pg-boss as the only delivery timing/retry owner, cursor subscription/reconciliation, and one daemon composition root.

## Required context

Read `AGENTS.md`, `GUIDELINES.md`, root and affected package/app READMEs, `TESTING.md`, `docs/plans/codex-app-server-embrace-dag.md`, and the CAS-03 assignment emitted by CAS-00. Invoke the global `seam`, `batdd`, `nx-monorepo`, `data-substrate`, and full `ponytail:ponytail` skills. Use the read-only Agent Wiki workflow for the orchestration SPEC, BATDD, TESTING, Clean Code, and File System because this seam authors durable control contracts. Read the BATDD Worker contract/profile and initialize the native execution plan before product writes.

## Dependency gate

Do not write product code until CAS-00 publishes `AUTHORITY_READY` and a schema-valid dispatchable CAS-03 assignment. Before that, bounded read-only hydration—including stash inspection without application—is allowed; then stop with the exact re-entry artifact required.

## Authorized write surface

- the CAS-03 paths assigned under `packages/process`, `packages/db`, and `packages/delivery`
- `apps/daemon` as the sole composition root
- module-local migrations, L1/L2 tests, and framework-neutral fixtures required by CAS-03
- affected package exports/project configuration only when required by the public seam or Nx validation

Single-writer ownership must be explicit for migrations, root composition, lockfiles, and shared configuration. Do not implement App Server protocol/transport, messaging semantics, handoff, workflows, UI, or MCP.

## Green Contract floor

- PostgreSQL is authoritative durable command/event/artifact/projection truth; reducer alone advances durable state.
- Command append and outbox/release semantics are idempotent and transactional; conflicting idempotency produces no write.
- pg-boss exclusively owns scheduling, leases, retry timing, and recovery. Application code must not grow a competing retry loop.
- Prove real migrations/roles/constraints, transaction plus delivery release, cursor snapshot/listen/requery, restart recovery, and zero-delta cleanup.
- Inspect preserved Herdr work only for generic PostgreSQL, pg-boss, Nest, or monitor behavior. Do not apply a stash wholesale and do not restore tmux/Herdr authority.
- Use Nx targets and nonzero real-boundary evidence; no implementer self-certification.

## Deliverables

1. Durable command/event/artifact/reducer/delivery contracts and one daemon composition root.
2. Real PostgreSQL/pg-boss RED/GREEN, restart, reconciliation, and cleanup evidence.
3. Handoff contract for CAS-04, CAS-05, and CAS-08.

## Stop and handoff

Stop at `CONTROL_FOUNDATION_READY`/`READY-FOR-AUDIT`; do not start CAS-05. Halt on unavailable substrate, migration ownership conflict, missing transaction semantics, or cleanup uncertainty. Do not commit, merge, push, apply/delete stashes, or touch unrelated dirty files.

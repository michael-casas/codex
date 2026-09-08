# CAS-06 Goal Charter — Direct Local and Remote Agent Handoff

**Model:** `gpt-5.6-sol`, medium reasoning  
**Role:** Base owner for delegation execution  
**State:** allocated; non-dispatchable until CAS-04 and CAS-05 terminals  
**Terminal:** `HANDOFF_READY`, `READY-FOR-AUDIT`, or an exact dependency halt

## Objective

Implement one `delegate_agent` intent that selects an admitted local or remote host, acquires an exact workspace lease, creates one durable delegation/execution/agent/thread binding, starts or continues the Codex turn, and returns one stable `AgentHandle`. The caller never performs host, workspace, thread, turn, or persistence choreography.

## Required context

Read `AGENTS.md`, `GUIDELINES.md`, root and affected package/app READMEs, `TESTING.md`, `docs/plans/codex-app-server-embrace-dag.md`, the immutable CAS-06 assignment, and accepted CAS-02/CAS-04/CAS-05 predecessor packets. Invoke global `seam`, `batdd`, `nx-monorepo`, `data-substrate`, `openai-docs`, and full `ponytail:ponytail` before product writes. Use the read-only Agent Wiki workflow for orchestration SPEC, BATDD, TESTING, Clean Code, and File System because this seam composes durable control authority.

Read current official App Server behavior for `thread/start`, `thread/resume`, `thread/read`, `turn/start`, `turn/steer`, `turn/interrupt`, approvals, user-input requests, and terminal events. Read the BATDD Worker contract/profile and initialize the native RED/freeze/GREEN execution plan.

## Dependency gate

Do not start a worker or write product code until CAS-00 publishes a schema-valid dispatchable CAS-06 assignment and coordinator evidence proves CAS-04 `WORKSPACE_READY` and CAS-05 `MESSAGING_READY` are materialized into this shared a4a6 checkout with their CAS-02/CAS-03 foundations. Before that terminal pair, CAS-06 remains an allocated DAG node only; no hydration task is required.

## Authorized write surface

- `packages/process/src/delegation/**`
- `packages/db/src/agent-delegation/**`
- `packages/delivery/src/agent-delegation/**` only when durable release timing is required and pg-boss remains sole delivery owner
- CAS-06 delegation worker/composition additions under `apps/daemon/**`
- module-local L1/L2 tests and the smallest existing public-surface L3 binding required by CAS-06
- affected package facades/configuration only when required by the public seam
- CAS-06 evidence under `packages/testing/evidence/cas-06-*.json` and `.agent/testing/cas-06/**`

CAS-02 host transport, CAS-04 workspace lease, CAS-05 messaging, generated protocol, credentials, root lockfiles, and root configuration are read-only predecessor surfaces unless an immutable coordinator amendment says otherwise. One coordinator owns overlapping migration and daemon-composition edits.

## Green Contract floor

- One `delegate_agent` call accepts stable assignment/digest, host, workspace intent, runtime profile, completion boundary, and idempotency identity; it returns one `AgentHandle` containing delegation/execution/agent/host/thread identities.
- Callers never supply raw paths, credentials, shell commands, App Server method order, provider request IDs, or intermediate workspace/thread creation steps. The basic flow has a one-call tool budget.
- Exact replay returns the original accepted handle. Conflicting idempotency fails with no additional lease, agent, thread, turn, message, or durable transition.
- One accepted command creates exactly one delegation/execution/agent/thread binding under an explicit runtime model, reasoning, sandbox, approval policy, assignment digest, and completion boundary.
- Local and authenticated remote WSS hosts use the same public delegation seam. No SSH, tmux, Herdr, terminal scraping, filesystem mailbox, Codex SDK, or hidden fallback.
- A new idle execution uses `thread/start` plus `turn/start`; continuation preserves current thread identity and uses active-turn `turn/steer` with `expectedTurnId` or an idle follow-up turn as appropriate.
- Approval and `tool/requestUserInput` waits become durable blocked decisions. Runtime terminal, quiet output, or transport close is never acceptance.
- Cancel is scoped and idempotent: interrupt only the bound active turn, release only the owned workspace/resources, and preserve durable history. Ambiguous disconnect reconciles before any replay.
- Completion boundaries remain distinct: `runtime-settled`, `output-validated`, and `ready-for-audit`. No caller or worker silently promotes one into another.
- L1 covers validation, authorization, one-call budget, idempotency, conflicting replay/no-write, state reduction, completion boundaries, and scoped cancel.
- L2 covers real local and remote App Server start/continue/interrupt, workspace binding, PostgreSQL/pg-boss durability, approval/user-input waits, App Server restart/resume, output validation, ambiguity reconciliation, redaction, and zero resource delta.
- L3 proves the control thread delegates one local and one remote agent, observes both handles, continues one, cancels or resolves a bounded wait, and receives bounded results without duplicate agents/turns.
- Use affected Nx targets with nonzero evidence. The implementer reports `READY-FOR-AUDIT` but does not self-certify.

## Deliverables

1. Durable delegation command, reducer/projection/repository, execution worker, queries, and scoped cancel/continue behavior.
2. One-call `delegate_agent` contract with measured tool-call budget and compact `AgentHandle`.
3. Meaningful RED/GREEN plus real local/remote App Server, workspace, messaging, persistence, restart, approval, cancellation, ambiguity, redaction, and cleanup evidence.
4. Handoff contracts for CAS-07, CAS-08, CAS-09, and CAS-12.

## Stop and handoff

Stop at `HANDOFF_READY` / `READY-FOR-AUDIT`, or `HALT` with the exact missing authority/capability, completed locked work, no-write state, resume condition, and next check. Do not begin CAS-07+, audit, QA, Final Polish, commit, merge, push, or cleanup outside owned test resources.

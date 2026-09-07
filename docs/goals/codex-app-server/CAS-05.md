# CAS-05 Goal Charter — Durable Agent Directory and Intercom

**Model:** `gpt-5.6-sol`, medium reasoning  
**Role:** Base owner for durable agent identity, messaging, and delivery  
**State:** allocated; dependency-gated by CAS-02 and CAS-03 materialization  
**Terminal:** `MESSAGING_READY`, `READY-FOR-AUDIT`, or an exact dependency halt

## Objective

Implement a durable local/remote agent directory and one-call send/ask/reply API. Persistence precedes delivery; PostgreSQL owns message truth, pg-boss owns delivery timing, and the admitted App Server transport chooses active-turn steer versus idle-turn start without exposing provider choreography to callers.

## Required context

Read `AGENTS.md`, `GUIDELINES.md`, root and affected package/app READMEs, `TESTING.md`, `docs/plans/codex-app-server-embrace-dag.md`, the immutable CAS-05 assignment, and verified CAS-02/CAS-03 predecessor packets. Invoke global `seam`, `batdd`, `nx-monorepo`, `data-substrate`, `openai-docs`, and full `ponytail:ponytail` before product writes. Use the read-only Agent Wiki workflow for the orchestration SPEC, BATDD, TESTING, Clean Code, and File System because this seam authors durable cross-host control contracts.

Read current official App Server behavior for `turn/steer`, `turn/start`, `thread/inject_items`, thread/turn reads, server requests, and reconnect semantics. Read the BATDD Worker contract/profile and initialize the native RED/freeze/GREEN execution plan.

## Dependency gate

Do not write product code until CAS-00 publishes a schema-valid dispatchable CAS-05 assignment and coordinator evidence proves the exact CAS-02 host transport and CAS-03 durable-control candidates are materialized into this isolated worktree. CAS-05 must explicitly depend on both terminals; do not invent a test-only or hidden transport.

## Authorized write surface

- `packages/process/src/agent-directory/**`
- `packages/process/src/agent-messaging/**`
- `packages/db/src/agent-*/**`
- `packages/delivery/src/agent-*/**`
- the smallest CAS-05-owned process migration under the existing migration authority
- CAS-05 delivery worker/composition additions under `apps/daemon/**`
- module-local L1/L2 tests and framework-neutral fixtures required by CAS-05
- affected package facades/configuration only when required by the public seam
- CAS-05 evidence under `packages/testing/evidence/cas-05-*.json` and `.agent/testing/cas-05/**`

One writer owns the migration sequence, daemon composition, root lockfile, and shared config. Root changes or overlap with CAS-03 require an immutable coordinator amendment. Do not modify CAS-02 protocol/transport, workflows, UI, or MCP gateway.

## Green Contract floor

- Stable agent, runtime, message, idempotency, and correlation identities; bounded message body and explicit authorization.
- One send/ask/reply call commits message plus outbox, chooses active-turn `turn/steer` with `expectedTurnId` versus idle `turn/start`, and returns one stable message/correlation handle. Passive context-only delivery may use `thread/inject_items` but is never claimed as wake delivery.
- Exact replay returns the original handle. Conflicting idempotency reuse fails with no state change. Receiver and worker deduplicate exact IDs.
- App Server acceptance, thread observation, and semantic reply are distinct durable states. A delivery acknowledgement never means the agent replied or the work was accepted.
- Ambiguous disconnect is never blindly retried. Reconcile the target thread using a stable message marker before deciding whether another turn is legal.
- PostgreSQL is truth; message/outbox commit together. pg-boss exclusively owns scheduling, leases, retry timing, expiration, recovery, and dead-letter transition.
- Offline delivery replays after daemon/broker/App Server restart without duplicate visible messages or turns. No polling loop, filesystem mailbox, tmux/Herdr transport, or second retry authority.
- Built-in `collabToolCall` is observable runtime data, not the durable cross-host bus.
- L1 covers reducer, correlation, duplicate/conflict/no-write, expiry, body bounds, authorization, and task-level call count.
- L2 covers real PostgreSQL/pg-boss, active/idle routes, offline replay, ambiguous acceptance reconciliation, restart, redaction, and zero resource delta.
- L3 proves local A sends/asks remote B, B replies, A receives one correlated reply, and duplicate delivery creates one visible message. Use only authorized sandbox/runtime profiles and never expose raw reasoning or credentials.
- Use affected Nx targets with nonzero evidence. The implementer reports `READY-FOR-AUDIT` but does not self-certify.

## Deliverables

1. Durable agent directory, message ledger/reducer, repository, queries, and delivery worker.
2. One-call agent-facing send/ask/reply contract with measured tool-call budget and compact handles.
3. Meaningful RED/GREEN plus real PostgreSQL, pg-boss, local/remote App Server, restart, reconciliation, redaction, and cleanup evidence.
4. Handoff contracts for CAS-06, CAS-07, CAS-08, and CAS-09.

## Stop and handoff

Stop at `MESSAGING_READY` / `READY-FOR-AUDIT`, or `HALT` with the exact missing authority/capability, completed locked work, no-write state, resume condition, and next check. Do not begin CAS-06+, audit, QA, Final Polish, commit, merge, push, or cleanup outside owned test resources.

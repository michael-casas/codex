# CAS-08 Goal Charter — Durable Runtime Visibility Projection

**Model:** `gpt-5.6-sol`, medium reasoning  
**Role:** Base owner for normalized runtime observation and visibility projection  
**State:** allocated; dependency-gated by CAS-01, CAS-03, CAS-05, CAS-06, and CAS-07 terminals  
**Terminal:** `VISIBILITY_PROJECTION_READY`, `READY-FOR-AUDIT`, or an exact dependency halt

## Objective

Ingest normalized App Server, delegation, messaging, and workflow events into durable redacted summaries with a monotonic cursor. Expose one bounded snapshot/wait interface for all workflow/agent summaries and one detailed feed only for a selected agent, reconstructable after daemon restart without storing a database row per token.

## Required context

Read `AGENTS.md`, `GUIDELINES.md`, root and affected package/app READMEs, `TESTING.md`, `docs/plans/codex-app-server-embrace-dag.md`, the immutable CAS-08 assignment, and accepted CAS-01/CAS-03/CAS-05/CAS-06/CAS-07 packets. Invoke global `seam`, `batdd`, `nx-monorepo`, `workflows`, `data-substrate`, `openai-docs`, and full `ponytail:ponytail` before product writes. Use the read-only Agent Wiki workflow for orchestration SPEC, BATDD, TESTING, Clean Code, and File System because this seam owns durable cross-capability projection contracts.

Read current official App Server event behavior: shared `item/started` and authoritative `item/completed`, turn/thread status notifications, text/tool deltas, server requests, compaction, disconnect, and notification opt-out. Read the BATDD Worker contract/profile and initialize the native RED/freeze/GREEN execution plan.

## Dependency gate

Do not write product code until CAS-00 publishes a schema-valid dispatchable CAS-08 assignment and coordinator evidence binds exact `PROTOCOL_READY`, `CONTROL_FOUNDATION_READY`, `MESSAGING_READY`, `HANDOFF_READY`, and `REMOTE_WORKFLOW_READY` packets in shared a4a6. Halt rather than infer an event contract or copy provider types into the projection.

## Authorized write surface

- `packages/process/src/visibility/**`
- `packages/db/src/runtime-visibility/**`
- the smallest CAS-08-owned process migration under the existing migration authority
- `apps/daemon/src/visibility/**`
- CAS-08 composition additions under existing daemon entrypoints only when explicitly assigned
- module-local L1/L2 tests and framework-neutral fixtures required by CAS-08
- affected package facades/configuration only when required by the public seam
- CAS-08 evidence under `packages/testing/evidence/cas-08-*.json` and `.agent/testing/cas-08/**`

One coordinator owns migration ordering, daemon composition, root lockfiles, and shared configuration. Do not modify App Server protocol/transport, workspace, messaging, delegation, workflow execution, MCP, Svelte UI, or credentials.

## Green Contract floor

- One normalized ingest contract accepts attributed runtime events without provider JSON-RPC types escaping into process callers.
- Final `item/completed` and `turn/completed` observations are authoritative. Deltas are advisory, ordered/coalesced presentation state and cannot advance acceptance.
- Persist bounded summaries and cursor checkpoints—not one durable database row per token. Batch/coalesce text and command deltas at a measured small interval or size threshold, preserving final content authority.
- Exclude raw reasoning, prompts, workflow input envelopes, environment, credentials, unnecessary paths, and full unbounded command output. Redaction occurs before durable storage, logs, events, and API results.
- Cursor is durable and monotonic. Snapshot plus listen plus requery closes races; duplicate notifications are idempotent; lost notifications are recovered from durable state; daemon restart reconstructs the same summary.
- All agents contribute compact summary state. Detailed message/command/tool feed data is returned only for `selectedAgentId`; switching/collapsing selection stops renewal and rejects late previous-selection results.
- One snapshot/wait call accepts `afterCursor`, optional selected agent, and bounded `waitMs`; callers do not list-then-get-then-subscribe. Empty waits return a compact unchanged result, not the full snapshot.
- Cap retained detailed events and body/output bytes with explicit truncation metadata. Use ordinary indexed PostgreSQL queries until a measured 500-row/window or latency threshold requires another mechanism; do not add a cache or stream broker speculatively.
- L1 covers normalization, redaction, final-vs-delta authority, coalescing, bounds/truncation, cursor ordering, duplicate/lost events, selected-feed filtering, and one-call budget.
- L2 covers real PostgreSQL snapshot/listen/requery, workflow/delegation/message projections, disconnect/reconnect, daemon restart reconstruction, concurrent cursor waits, retention, cleanup, and zero resource delta.
- Representative behavior proves N/X workflow and agent summaries advance while only the selected agent’s detailed feed transfers.
- Live Synology remains read-only. CAS-08 may consume read-only observations but must not start, steer, interrupt, inject, or mutate remote work.
- Use affected Nx targets with nonzero evidence. The implementer reports `READY-FOR-AUDIT` but does not self-certify.

## Deliverables

1. Normalized/redacted event ingest, durable projection/repository, cursor, snapshot, and bounded wait interfaces.
2. Coalescing/retention policy with measured thresholds and no per-token durable write path.
3. One-call snapshot/selected-feed contract with compact unchanged responses.
4. Meaningful RED/GREEN plus real PostgreSQL, restart/reconciliation, filtering, redaction, performance, and cleanup evidence.
5. Handoff contract for CAS-09, CAS-10, and CAS-12.

## Stop and handoff

Stop at `VISIBILITY_PROJECTION_READY` / `READY-FOR-AUDIT`, or `HALT` with the exact missing authority/capability, completed locked work, no-write state, resume condition, and next check. Do not begin CAS-09+, audit, QA, Final Polish, commit, merge, push, or cleanup outside owned test resources.

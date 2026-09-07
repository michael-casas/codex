# CAS-07 Goal Charter — Remote Workflow Execution

**Model:** `gpt-5.6-sol`, medium reasoning  
**Role:** Base owner for App Server-backed workflow execution  
**State:** allocated; non-dispatchable until CAS-06 terminal  
**Terminal:** `REMOTE_WORKFLOW_READY`, `READY-FOR-AUDIT`, or an exact dependency halt

## Objective

Make one trusted TypeScript `run_workflow` intent execute every agent node against one selected admitted App Server host/workspace, preserving typed dataflow, parallel/dependent phases, artifacts, exact model/reasoning, cancellation, durable observation, and one stable run handle. Remove the production Codex SDK executor only after real App Server parity is proven.

## Required context

Read `AGENTS.md`, `GUIDELINES.md`, root and affected package/app READMEs, `TESTING.md`, `docs/plans/codex-app-server-embrace-dag.md`, the immutable CAS-07 assignment, and accepted CAS-01/CAS-05/CAS-06 predecessor packets. Invoke global `seam`, `batdd`, `nx-monorepo`, `workflows`, `data-substrate`, `openai-docs`, and full `ponytail:ponytail` before product writes. Use the read-only Agent Wiki workflow for orchestration SPEC, BATDD, TESTING, Clean Code, and File System because this seam changes durable workflow execution authority.

Read current official App Server behavior for thread/turn start, events, interrupt, server requests, reconnect, model/effort validation, and sandbox/approval options. Read the Workflows CLI/schema/examples references, BATDD Worker contract/profile, and initialize the native RED/freeze/GREEN execution plan.

## Dependency gate

Do not start a worker or write product code until CAS-00 publishes a schema-valid dispatchable CAS-07 assignment and coordinator evidence proves CAS-06 `HANDOFF_READY` is present in the shared a4a6 checkout with CAS-01 protocol and CAS-05 messaging. Before that terminal, CAS-07 remains an allocated DAG node only; no hydration task is required.

## Authorized write surface

- the existing provider-neutral workflow execution seam under `packages/workflows/**`
- the smallest App Server-backed workflow execution adapter under the owning `packages/codex/**` or `packages/process/**` module selected by current callers
- CAS-07 workflow submission/execution/composition additions under `apps/daemon/**`
- `apps/codex-workflows/**` only for the direct compatibility/submission client boundary
- module-local L1/L2 tests and the smallest existing public-surface L3 binding required by CAS-07
- affected package facades/configuration only when required by the public seam
- CAS-07 evidence under `packages/testing/evidence/cas-07-*.json` and `.agent/testing/cas-07/**`

Root lockfiles/configuration, CAS-01 protocol, CAS-02 host transport, CAS-04 workspace lease, CAS-05 messaging, CAS-06 delegation, credentials, and generated protocol are read-only predecessor surfaces unless an immutable coordinator amendment says otherwise. One coordinator owns overlapping daemon/root composition and removal of the old SDK path.

## Green Contract floor

- One `run_workflow` call accepts trusted workflow/source digest, input, host, workspace intent, runtime profile, and idempotency identity; it returns one durable run handle. Callers never manually launch agent nodes or know App Server method order.
- V1 placement is run-level: every agent node in one run targets one admitted host/workspace. Per-node multi-host scheduling remains deferred.
- Preserve trusted executable TypeScript source admission, typed phase/parallel/agent/artifact dataflow, schema validation, bounded concurrency, exact model/reasoning, cancellation, and deterministic exit/result behavior.
- Inject an App Server-backed `executeAgent` through the existing provider-neutral seam. Add stable node identity and a bounded normalized runtime-event callback; do not leak provider JSON-RPC types into workflow authoring.
- One accepted run creates one durable run and one attributed runtime binding per agent node. Exact replay returns the original run handle; conflicting reuse fails with no duplicate thread, turn, artifact, or transition.
- Parallel nodes start concurrently within the declared bound. Dependent phases do not start until every required upstream value is valid. Failure/cancel prevents illegal downstream starts.
- App Server turn/item completion is runtime evidence, not workflow acceptance. Preserve output schema validation and artifact registration before node/run completion.
- Connection loss is ambiguous: reconcile durable node/thread markers before retry. Never blindly create another turn or node. pg-boss remains sole delivery/retry timing owner.
- Cancellation interrupts only active bound turns, stops future nodes, preserves completed artifacts/history, releases owned workspace/resources, and is idempotent.
- App Server becomes the only production Codex executor after parity. Remove the `@openai/codex-sdk` production path rather than shipping two canonical runtimes; preserve separately required compatibility validation until removal is authorized.
- L1 covers placement, one-call budget, stage totals, node attribution, typed values, schema failure, idempotency/conflict, cancellation, event normalization, and forbidden downstream starts.
- L2 covers real App Server parallel/dependent turns, artifact/result flow, failure/cancel, reconnect/reconciliation, restart recovery, redaction, and zero resource delta.
- L3 proves a remote research phase reaches N/X, its dependent implementation phase starts only afterward, and the final artifact/result is observable from the control surface.
- The live aes-j5-synology App Server remains read-only unless the Founder explicitly expands permission. Use controlled authenticated WSS fixtures for mutating workflow dogfood and halt if live remote execution is required for the terminal.
- Use affected Nx targets with nonzero evidence. The implementer reports `READY-FOR-AUDIT` but does not self-certify.

## Deliverables

1. App Server-backed `executeAgent`, durable workflow submission/execution composition, and stable run/node handles.
2. One-call `run_workflow` contract with measured tool-call budget and compact result/event shapes.
3. Meaningful RED/GREEN plus real App Server, parallel/dependent phase, artifact, cancel, reconnect, restart, redaction, and cleanup evidence.
4. Removal evidence for the production Codex SDK executor after parity and handoff contracts for CAS-08, CAS-09, and CAS-12.

## Stop and handoff

Stop at `REMOTE_WORKFLOW_READY` / `READY-FOR-AUDIT`, or `HALT` with the exact missing authority/capability, completed locked work, no-write state, resume condition, and next check. Do not begin CAS-08+, audit, QA, Final Polish, commit, merge, push, or cleanup outside owned test resources.

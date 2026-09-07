# CAS-09 Goal Charter — Task-Level MCP Control and Visibility Gateway

**Model:** `gpt-5.6-sol`, medium reasoning  
**Role:** Base owner for the `codex-control` MCP application  
**State:** allocated; non-dispatchable until CAS-08 terminal  
**Terminal:** `MCP_READY`, `READY-FOR-AUDIT`, or an exact dependency halt

## Objective

Expose the accepted host, messaging, handoff, workflow, decision, and visibility capabilities through one narrow MCP server whose tools express agent intent rather than App Server choreography. Common operations complete in one tool call and return compact stable handles; authorization, destructive annotations, cancellation, ambiguity, and human decisions remain explicit.

## Required context

Read `AGENTS.md`, `GUIDELINES.md`, root and affected package/app READMEs, `TESTING.md`, `docs/plans/codex-app-server-embrace-dag.md`, the immutable CAS-09 assignment, and accepted CAS-05/CAS-06/CAS-07/CAS-08 packets. Invoke global `seam`, `batdd`, `nx-monorepo` including the generator route before creating an app, `workflows`, `data-substrate`, `openai-docs`, and full `ponytail:ponytail` before product writes. Use the read-only Agent Wiki workflow for orchestration SPEC, BATDD, TESTING, Clean Code, and File System because this app exposes durable control authority.

Read current official MCP and Apps documentation for tool schemas, annotations, cancellation, resources, model-readable results, authorization, and `_meta.ui.resourceUri`. CAS-09 owns tools and model-readable fallbacks; CAS-10 owns the real Svelte visibility component and final UI resource binding. Read the BATDD Worker contract/profile and initialize the native RED/freeze/GREEN execution plan.

## Dependency gate

Do not start a worker or write product code until CAS-00 publishes a schema-valid dispatchable CAS-09 assignment and coordinator evidence proves CAS-05 `MESSAGING_READY`, CAS-06 `HANDOFF_READY`, CAS-07 `REMOTE_WORKFLOW_READY`, and CAS-08 `VISIBILITY_PROJECTION_READY` are present in shared a4a6. Before CAS-08 terminal, CAS-09 remains an allocated DAG node only; no hydration task is required.

## Authorized write surface

- `apps/codex-control/**`
- the smallest existing package facade/configuration changes required to consume accepted public seams
- module-local L1/L2 tests and framework-neutral fixtures required by CAS-09
- CAS-09 evidence under `packages/testing/evidence/cas-09-*.json` and `.agent/testing/cas-09/**`

One coordinator owns root package/lock/Nx/TypeScript composition and any generated application registration. Accepted process/db/delivery/transport/workflow implementations, credentials, Svelte UI, plugin packaging, and external tunnels are read-only predecessors or later seams.

## Green Contract floor

- Build one executable `codex-control` MCP application using the workspace’s existing MCP/Nx conventions; do not create a second daemon, scheduler, reducer, retry loop, database authority, or generic API framework.
- Tools call accepted public seams and remain useful without UI. No tool accepts raw credentials, host paths, shell commands, App Server methods, database identifiers, or provider request IDs.
- Task-level budgets:
  - one `delegate_agent` call returns `AgentHandle`;
  - one `send_agent_message`, `ask_agent`, or `reply_agent` call returns message/correlation state;
  - one `run_workflow` call returns a durable run handle;
  - one snapshot/wait call returns the bounded current delta for summaries or one selected-agent feed.
- Reject list/get/create/start choreography for one accepted intent. Record actual model-facing call counts and compact result sizes in evidence.
- Keep schemas focused and strict with stable IDs, bounded strings/objects, explicit idempotency, cancellation, timeouts, and owned errors. Unknown fields and conflicting replays fail with no write.
- Apply authorization in handlers against scoped control-plane clients. Hidden metadata, UI state, prompts, and model claims are never authorization.
- Accurate MCP annotations distinguish read-only, mutating, and destructive operations. Destructive or consequential actions preserve explicit confirmation/approval rather than compressing safety into a macro.
- Visibility tools expose snapshot/wait and selected-feed semantics; raw reasoning, prompts, credentials, environment, unnecessary paths, and unbounded command output remain excluded.
- Provide model-readable structured/text fallback results now. Do not build a placeholder widget or bind a fake `ui://` resource; CAS-10 owns the real component/resource integration. If a render tool exists before CAS-10, it must fail or fall back truthfully without claiming rendered UI.
- MCP transport lifecycle, cancellation, long-poll disconnect, duplicate requests, unavailable daemon, malformed IDs, authorization denial, and cleanup fail closed.
- L1 covers schema/admission, annotations, authorization, tool-call budgets, handler mapping, idempotency, compact results, and redaction.
- L2 covers the real MCP protocol/Inspector surface, representative positive/negative tool calls, daemon/database boundary, long-poll cancellation, reconnect, resource cleanup, and zero unexpected delta.
- Representative behavior invokes messaging, handoff, workflow, and visibility through tools without direct App Server choreography.
- Live Synology remains read-only. Mutating tool tests use controlled local/authenticated WSS fixtures unless the Founder explicitly expands permission.
- Use affected Nx targets with nonzero evidence. The implementer reports `READY-FOR-AUDIT` but does not self-certify.

## Deliverables

1. Executable `apps/codex-control` MCP server and narrow tool schemas/handlers over accepted seams.
2. One-call task API budgets with compact stable handle/results and truthful model-readable fallbacks.
3. Authorization/annotation/cancellation/redaction behavior and no hidden provider choreography.
4. Meaningful RED/GREEN plus real MCP protocol, daemon, long-poll/reconnect, negative-path, and cleanup evidence.
5. Handoff contract for CAS-10, CAS-11, and CAS-12.

## Stop and handoff

Stop at `MCP_READY` / `READY-FOR-AUDIT`, or `HALT` with the exact missing authority/capability, completed locked work, no-write state, resume condition, and next check. Do not begin CAS-10+, audit, QA, Final Polish, commit, merge, push, publish, tunnel, or cleanup outside owned test resources.

# CAS-02 Goal Charter — Local and Remote App Server Host Transport

**Model:** `gpt-5.6-sol`, medium reasoning  
**Role:** Base owner for the App Server host transport  
**State:** allocated; dependency-gated by CAS-00 and CAS-01  
**Terminal:** `HOST_TRANSPORT_READY`, `READY-FOR-AUDIT`, or an exact dependency halt

## Objective

Admit, connect, health-check, disable, and reconnect local managed/proxy and remote authenticated WSS Codex App Server hosts behind one narrow host transport, without SSH, tmux, Herdr, or raw-secret leakage.

## Required context

Read `AGENTS.md`, `GUIDELINES.md`, root/package READMEs, `TESTING.md`, `docs/plans/codex-app-server-embrace-dag.md`, the CAS-02 assignment emitted by CAS-00, and the accepted CAS-01 interface/evidence. Invoke the global `seam`, `batdd`, `nx-monorepo`, `openai-docs`, and full `ponytail:ponytail` skills. Read the BATDD Worker contract/profile and initialize the native execution plan before product writes. Inspect existing transport callers before introducing files or dependencies.

## Dependency gate

No product writes until both `AUTHORITY_READY` and `PROTOCOL_READY` are available at the exact predecessor identities named by the assignment. Before that, perform only bounded read-only hydration and publish the re-entry requirement.

## Authorized write surface

- `packages/transport/src/app-server-host/**`
- module-local L1/L2 tests and framework-neutral fixtures required by CAS-02
- `packages/transport` exports/project configuration only when required by the public seam or Nx validation

Do not implement workspace leases, delegation, workflows, durable messaging, UI, MCP, or another retry authority.

## Green Contract floor

- Current adapters are local managed daemon through unix/proxy stdio and remote authenticated WSS over TLS.
- Reject non-loopback plaintext, raw credentials in configuration/events, version/capability mismatch, and unavailable authentication.
- Restore idempotent subscriptions after bounded jittered reconnect; classify overload `-32001`, authentication denial, TLS identity failure, and ambiguous disconnects.
- Prove local daemon restart/proxy reconnect and a real admitted remote WSS endpoint. If no authorized TLS/authenticated remote endpoint exists, complete locked local work and halt at the external checkpoint—never add SSH fallback.
- Reuse CAS-01 correlation/protocol mechanics; do not duplicate them in transport.
- Use Nx targets and nonzero evidence; no implementer self-certification.

## Deliverables

1. Host registry/transport interface and both admitted adapters.
2. Security/version/reconnect RED/GREEN evidence with cleanup/resource inventory.
3. Handoff contract for CAS-04, CAS-06, and CAS-12.

## Stop and handoff

Stop at `HOST_TRANSPORT_READY`/`READY-FOR-AUDIT`, or at `HALT` naming the missing remote endpoint/capability and exact resume condition. Do not commit, merge, push, or touch unrelated dirty files.

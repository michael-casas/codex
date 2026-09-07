# CAS-01 Goal Charter — Typed App Server Protocol Client

**Model:** `gpt-5.6-sol`, medium reasoning  
**Role:** Base owner for `packages/codex`  
**State:** allocated; dependency-gated by CAS-00  
**Terminal:** `PROTOCOL_READY`, `READY-FOR-AUDIT`, or an exact dependency halt

## Objective

Build the smallest deep, version-pinned Codex App Server client that owns initialization, typed request correlation, bounded notification streaming, server requests, cancellation, provider-error mapping, and cleanup over the real local stdio boundary.

## Required context

Read `AGENTS.md`, `GUIDELINES.md`, root/package READMEs, `TESTING.md`, `docs/plans/codex-app-server-embrace-dag.md`, the CAS-01 assignment emitted by CAS-00, and the global `seam`, `batdd`, `nx-monorepo`, `openai-docs`, and full `ponytail:ponytail` skills. Read the BATDD Worker contract/profile and initialize the required native execution plan before any product write. Inspect all existing `packages/codex` callers and App Server experiments before designing a new surface.

## Dependency gate

Do not write product code until CAS-00 publishes `AUTHORITY_READY` and a schema-valid dispatchable CAS-01 assignment. Before that, bounded read-only hydration is allowed; then stop with the exact re-entry artifact required.

## Authorized write surface

- `packages/codex/src/app-server-client/**`
- `packages/codex/generated/app-server/<pinned-version>/**`
- module-local L1/L2 tests and framework-neutral fixtures required by CAS-01
- `packages/codex` exports/project configuration only when the public seam or Nx validation requires it

Do not implement remote WSS/host admission, durable orchestration, workflows, messaging, UI, MCP, or daemon composition.

## Green Contract floor

- Generate protocol bindings with the installed pinned Codex CLI; do not hand-maintain provider unions.
- RED then GREEN: initialize exactly once; correlate responses; reject duplicate/unmatched IDs; bound queues; handle cancellation, unknown notifications, server requests, malformed JSON, EOF, slow consumers, and secret redaction.
- L2 against a real `codex app-server --listen stdio://`: start thread/turn, observe delta and terminal item, interrupt, and prove child/process/stream cleanup.
- Version mismatch and ambiguous EOF fail closed. Provider types/errors do not leak through the domain-owned interface.
- Use Nx targets and nonzero evidence; no implementer self-certification.

## Deliverables

1. The narrow typed client and generated-schema digest.
2. Meaningful RED/GREEN and real-boundary evidence bound to exact CLI/base/candidate identities.
3. A handoff describing the public interface CAS-02 and CAS-08 may consume.

## Stop and handoff

Stop at `PROTOCOL_READY`/`READY-FOR-AUDIT`; do not start CAS-02. Halt rather than guessing on missing generated protocol support, incompatible installed CLI, approval semantics, or cleanup fidelity. Do not commit, merge, push, or touch unrelated dirty files.

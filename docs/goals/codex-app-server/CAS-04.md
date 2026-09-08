# CAS-04 Goal Charter — App Server Workspace Lease

**Model:** `gpt-5.6-sol`, medium reasoning  
**Role:** Base owner for `packages/transport/src/workspace-lease`  
**State:** allocated; dependency-gated by CAS-02 and CAS-03 materialization  
**Terminal:** `WORKSPACE_READY`, `READY-FOR-AUDIT`, or an exact dependency halt

## Objective

Implement one bounded workspace-lease operation that acquires, reuses, and releases an exact-revision local or remote repository workspace through admitted Codex App Server capabilities. Callers receive a stable `workspaceRef`; they never select a raw host path or shell command.

## Required context

Read `AGENTS.md`, `GUIDELINES.md`, root/package READMEs, `TESTING.md`, `docs/plans/codex-app-server-embrace-dag.md`, the immutable CAS-04 assignment, and the verified CAS-02/CAS-03 predecessor packets. Invoke global `seam`, `batdd`, `nx-monorepo`, `openai-docs`, and full `ponytail:ponytail` before product writes. Read the BATDD Worker contract/profile and initialize the native RED/freeze/GREEN execution plan.

Use current official App Server documentation and the generated 0.151.0 bindings for `fs/*`, `command/exec`, sandbox, and approval behavior. Do not hand-maintain provider types or infer unsupported remote Git capability.

## Dependency gate

Do not write product code until CAS-00 publishes a schema-valid dispatchable CAS-04 assignment and coordinator evidence proves the exact CAS-02 and CAS-03 candidates are materialized into this isolated worktree. Halt rather than copying predecessor files yourself.

## Authorized write surface

- `packages/transport/src/workspace-lease/**`
- module-local L1/L2 tests and framework-neutral fixtures required by CAS-04
- `packages/transport/src/index.ts` and package-local Nx/TypeScript configuration only when required by the public seam
- CAS-04 evidence under `packages/testing/evidence/cas-04-*.json` and `.agent/testing/cas-04/**`

Root lockfiles, root TypeScript references, generated protocol files, migrations, daemon composition, credentials, and CAS-02 host transport remain coordinator/predecessor-owned unless an immutable amendment says otherwise.

## Green Contract floor

- One acquire call accepts stable host/repository/base/assignment identities and returns one `workspaceRef`; caller-facing tool choreography does not expose Git commands, raw paths, intermediate provider IDs, or App Server method order.
- Exact idempotent replay returns the same live lease; conflicting reuse and concurrent incompatible leases fail with no write.
- Preserve a dirty primary checkout and create only an isolated authorized workspace. Reject symlink traversal, path escape, ambiguous repository identity, wrong revision, and caller-selected absolute paths.
- Prepare through admitted App Server filesystem/command capabilities under an explicit sandbox. No SSH, tmux, Herdr, terminal scraping, filesystem mailbox, or hidden local shell fallback.
- Release is explicit, scoped, idempotent, recoverable, and leaves zero unexpected process/socket/temp/worktree delta. Never delete a workspace not owned by the lease.
- L2 proves a real local repository and the authorized non-local App Server host, including disconnect/reconciliation, concurrent denial, dirty-checkout preservation, and cleanup.
- If App Server 0.151.0 cannot faithfully perform required remote Git preparation under the selected sandbox/approval contract, preserve locked work and halt for a Founder scope decision.
- Use affected Nx targets with nonzero evidence. The implementer reports `READY-FOR-AUDIT` but does not self-certify.

## Deliverables

1. Narrow workspace lease interface plus current local/remote implementation.
2. Frozen tool-call budget and compact `workspaceRef` result contract.
3. Meaningful RED/GREEN, real-boundary, reconciliation, and cleanup evidence bound to exact predecessors.
4. A handoff contract for CAS-06 and CAS-12.

## Stop and handoff

Stop at `WORKSPACE_READY` / `READY-FOR-AUDIT`, or `HALT` with the exact missing App Server capability, completed locked work, no-write state, resume condition, and next check. Do not begin CAS-06, audit, QA, Final Polish, commit, merge, push, or cleanup outside owned test resources.

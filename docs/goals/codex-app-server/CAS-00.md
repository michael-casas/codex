# CAS-00 Goal Charter — Authority and Assignment Activation

**Model:** `gpt-5.6-sol`, medium reasoning  
**Role:** campaign coordinator and sole root/config writer  
**State:** dispatchable  
**Terminal:** `AUTHORITY_READY` or an exact dependency halt

## Objective

Activate the Codex App Server campaign without product implementation: reconcile the explicit Founder ruling with repository doctrine, freeze the campaign/base identity and owned contracts, compile a Web-capable BATDD profile, and publish immutable assignment envelopes and non-overlapping write leases for CAS-01, CAS-02, and CAS-03.

## Required context

Read, in order:

1. `AGENTS.md`, `GUIDELINES.md`, `README.md`, and `TESTING.md`.
2. `docs/plans/codex-app-server-embrace-dag.md`, especially CAS-00 through CAS-03, waves, assignments, and checkpoints.
3. The global `seam`, `batdd`, `nx-monorepo`, `openai-docs`, `agent-wiki`, and `ponytail:ponytail` skills. Ponytail level is full.
4. `.agents/batdd/WORKER-CONTRACT.md`, `.agents/batdd/profile.json`, both schemas, and existing assignment examples.
5. Via the read-only Agent Wiki workflow: `codex/orchestration/SPEC`, `BATDD`, `TESTING`, `Clean Code`, and `File System`.
6. Current Git status, detached base `b9dc01512975a8b11bc673b5ec906c818dd708f6`, dirty provenance, and both preserved Herdr stashes. Do not apply or delete a stash.

The explicit Founder ruling for this campaign supersedes tmux/Herdr-as-canonical repository text: Codex App Server is the canonical Codex execution backend locally and remotely; PostgreSQL/pg-boss remain durable orchestration truth and delivery; Herdr may return only for non-Codex harnesses.

## Authorized write surface

- `.agents/batdd/profile.json`
- `.agents/batdd/assignments/CAS-*.json`
- the smallest required profile/assignment schema or validation fixture changes
- repository architecture/routing documentation that directly conflicts with the Founder ruling
- root Nx/testing configuration only when required to make the compiled profile truthful
- CAS-00 evidence under `.agents/` or `test-output/`

No product implementation under `apps/` or `packages/`.

## Required behavior and evidence

- Record immutable campaign ID, exact base revision, dirty provenance, dependency graph, role/model allocation, write surfaces, commit authority, and stop boundaries.
- Make Web applicable for the existing Svelte control surface without declaring unimplemented Playwright/Cucumber behavior green.
- Assign `gpt-5.6-sol` medium by default. Reserve `gpt-5.6-luna` medium only for later mechanically bounded work with frozen contracts; do not downgrade these four seams.
- Prove the pre-change profile/architecture rejects the new authority, then validate the amended profile and every assignment against their schemas.
- Keep CAS-01 and CAS-03 blocked until `AUTHORITY_READY`; keep CAS-02 blocked until both `AUTHORITY_READY` and `PROTOCOL_READY`.
- Do not edit the Agent Wiki. Report remaining doctrine conflicts for a later explicitly authorized Wiki change.
- Do not commit, merge, push, apply stashes, or alter unrelated dirty files.

## Deliverables

1. Schema-valid CAS-00, CAS-01, CAS-02, and CAS-03 assignment envelopes.
2. A truthful compiled repository profile and minimal architecture authority update.
3. Machine-readable validation evidence and a concise handoff naming exact artifact paths/digests.

## Stop and handoff

Stop at `AUTHORITY_READY`; do not begin CAS-01, CAS-02, or CAS-03 product work. If authority, base identity, profile fidelity, or write ownership cannot be made unambiguous, stop at `HALT` with the missing fact, completed locked work, no-write state, resume condition, and next check.

# Base Repair Coordinator Charter

**Role:** Campaign Coordinator for `CAS-APP-SERVER-20260901-01`  
**Working directory:** `/Users/mcasa_atlantis/.codex/worktrees/a4a6/.codex` only  
**Terminal:** dispatch packet ready or exact authority halt

## Objective

Compile the Founder-approved Codex-native Base repair chain into immutable,
schema-valid assignments without implementing product behavior:

`CAS-09.R2` → `CAS-11.R2` → `CAS-12.R1`

## Required context

Read `AGENTS.md`, `GUIDELINES.md`, the campaign DAG, the three repair charters,
the BATDD profile/schema/worker contract, and the read-only Agent Wiki
orchestration specification. Preserve the accepted predecessor artifact
identities and the detached candidate revision.

## Authorized writes

- `.agents/batdd/campaigns/CAS-APP-SERVER-20260901-01.json`
- `.agents/batdd/assignments/CAS-09-R2.json`
- `.agents/batdd/assignments/CAS-11-R2.json`
- `.agents/batdd/assignments/CAS-12-R1.json`
- `.agents/batdd/evidence/CAS-BASE-REPAIR-DISPATCH-READY.json`

Do not write product code, tests, root configuration, lockfiles, charters, the
campaign plan, another worktree, home configuration, or external systems.

## Assignment contract

- `CAS-09.R2` is dispatchable now on `gpt-5.6-sol` with medium reasoning and a
  strict shared-worktree write lease. Its terminal is `CONTROL_RUNTIME_READY`.
- `CAS-11.R2` is allocated but non-dispatchable until the exact accepted
  `CAS-09.R2` evidence. Its terminal is `CODEX_PLUGIN_READY`.
- `CAS-12.R1` is allocated but non-dispatchable until the exact accepted
  `CAS-11.R2` evidence. Its terminal is `BASE_READY`.
- Every worker uses BATDD meaningful RED, freeze, GREEN, affected gates,
  cleanup, and immutable evidence; no worker self-certifies.
- Remote App Server activity remains read-only. No secret enters chat, argv,
  repository files, or evidence.
- No commit, merge, push, publication, deployment, CAS-13, audit, QA,
  verification, or Final Polish is authorized.

## Validation and handoff

Validate every assignment against `.agents/batdd/assignment.schema.json`,
format all written JSON, hash every output, and report exact paths and SHA-256
digests. Do not launch workers. Stop after the dispatch packet is ready or
report the exact missing authority with zero out-of-scope writes.

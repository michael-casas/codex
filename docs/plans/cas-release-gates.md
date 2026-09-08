# CAS release gates

## Validated local checkpoint — 2026-09-08

Candidate `85b810c070bb18ec4374303bb0b30fc3f81dbaa0` passed the full uncached
Nx `test` run: 11 project aggregates and 26 dependency tasks. Separate database
and delivery L2, process L3, desktop/mobile Playwright, and native-plugin live
gates also passed. Run logs are retained locally as `/tmp/cas-final-full-r3.log`,
`/tmp/cas-supp-final.log`, and `/tmp/cas-ui-close.log`. These are local execution
proof, not a claim that GitHub CI or branch promotion has completed.

Root source/config/skill reconciliation is included; local-only data and secrets
remain excluded. Promotion/PR checks and canonical checkout transition are
still pending. Earlier observations below are historical, not current failures.

## CAS-RELEASE-GATES-R1 execution plan

1. Hydrate the assigned base, compiled BATDD profile, resolved Nx targets, and
   deterministic RED logs.
2. Freeze the existing assertions and test meaning; treat package-manager
   contract, owned layer markers/suite labels, and nonzero standing selection as
   the only repair rows.
3. Reproduce package-manager-policy, test-policy, and workflows standing-target
   selection RED without launching paid live App Server tests.
4. Apply only stale contract constants, truthful layer annotations/labels, and
   standing-filter corrections on the authorized surfaces.
5. Run package-manager-policy, test-policy, affected lint/typecheck/L1, applicable
   controlled non-live tests, and cleanup/resource checks.
6. Record exact evidence and remaining credential/runtime/paid-live prerequisites,
   then stop `READY-FOR-REVIEW` without declaring `BASE_READY`.

Founder authorized final-gate work and merge to main on 2026-09-07. Promotion
still follows CAS/CAS-BASE -> CAS/integration -> development -> staging -> main.
Jira remains waived. No new audit campaign is implied. BASE_READY and release
acceptance remain distinct; do not rewrite immutable predecessor packets.

## Founder network ruling — 2026-09-08

For CAS agent execution, omitted network policy now means enabled. Explicit
`networkAccess: false` remains an opt-out, and the effective per-agent value
must be validated, frozen, journaled, and propagated through local workflows,
durable workflows, and direct local or remote App Server handoffs. This ruling
does not widen filesystem roots, read-only restrictions, approval policy,
TLS/authentication, secret handling, or non-agent workspace/Git command policy.

Default-network hardening is deferred until after Base is fully merged into the
development branch. This ruling is implementation authority, not release
acceptance: the paid three-stage Luna-low reproof, fresh Preflight, independent
verification and judgment, and final promotion gates remain required.

## Historical candidate and gate admission

Founder reconciliation ruling: Codex Control/App Server supersedes Herdr as the
primary agent-handoff and workflow backend. Preserve the requested Herdr source
work for future cross-harness integration, but do not make it a dependency or
silent fallback for CAS. Reconcile the requested root changes on the private
CAS branch, excluding secrets and machine-local runtime data, then run the full
`.codex` project test suites before CAS/integration is merged into development.

Founder addition (2026-09-07): promotion is also blocked on the required
[native-plugin clean-container installation gate](cas-native-plugin-container-gate.md).
This gate was initially NOT RUN; source-level MCP tests or the earlier App Server container
dogfood do not satisfy native Codex plugin installation and fresh-session use.

The original candidate was CAS/CAS-BASE at b9dc01512975a8b11bc673b5ec906c818dd708f6 plus uncommitted
implementation. The main checkout also has unrelated dirty state. Preserve
that state; never merge into it blindly or stash ignored secrets. A scoped
candidate inventory and final immutable checkpoint remain required.

## Gate observations — 2026-09-07

- Refreshed the canonical plugin with the supported CLI flow to
  0.1.0+codex.20260907120319. Installed cached SKILL.md matches source byte for
  byte, including skill metadata version1.1.0. Fresh-task pickup remains to be
  observed; existing tasks retain their old loaded skill context.
- Eight projects with test-l1 targets pass uncached. DB/delivery have L2 targets
  instead; control-gateway exposes no direct test target and relies on consumer
  coverage. Do not call the skipped target names tested.
- Database L2:13/13 passed. Delivery L2:7/10 passed,3 authenticated App Server
  tests failed under ambient codex0.153.2. Campaign pin is0.151.0. A pinned
  rerun needs the existing paid-test budget respected: idle-message delivery
  can start actual model turns with inherited effort, not merely synthetic I/O.
- All selected build/typecheck targets passed. Process lint was the sole
  blocking lint target; documented its existing parent-search catch without
  changing behavior, then lint --quiet passed. Existing warnings remain.
- Browser R2 desktop/mobile final rerun:16/16 passed in43.2s, with the
  configured IPv6 loopback origin and localhost proxy exclusions. The Nx-owned
  Vite dependency was stopped by the task runner afterward; the pre-existing
  viewer remained available. Local/mobile endpoints both return200; Nx sync
  passes. This is synthetic native Web evidence, not remote provider dogfood.

## Remote integration blocker

Current production runtime registers only local-demo/codex-demo. The intended
Synology HTTPS endpoint responds400 with verified TLS to an unauthenticated
health-path probe; this proves reachability only, not protocol/auth health.
CODEX_APP_SERVER_AES_J5_8443 is absent from shell and launchd. The production
credential resolver expects an absolute owner-only local file path. Earlier
CAS-02 used an injected resolver; its success does not configure this daemon.

Requested Founder input: approved protected local credential-file path only,
never the token. Then resolve/admit an exact remote repository/base and perform
the required read-only remote launch/observation/completion/recovery checks.
Do not replace them with another local fixture or desktop SSH task.

## Remaining closure

Reconcile CAS-12 re-entry dependencies with current repairs and native Web
acceptance. Finish scoped integrated recovery and evidence/resource checks.
Separate unrelated skills, Herdr helpers, user configuration and local runtime
state from the CAS commit. Preserve the structural polish waiver and pending
artifact-download/preview decision. Commit and promote only after required
gates pass; do not label this document an acceptance packet.

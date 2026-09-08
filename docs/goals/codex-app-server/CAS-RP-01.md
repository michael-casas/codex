# CAS-RP-01 — Explicit Agent Runtime Profiles

Model: gpt-5.6-sol, medium reasoning. Role: Base repair worker.
Workspace: /Users/mcasa_atlantis/.codex/worktrees/a4a6/.codex only.
Terminal: AGENT_RUNTIME_PROFILE_READY / READY-FOR-AUDIT or exact dependency halt.

## Objective and Founder authority

The Founder explicitly supersedes the global medium-only workflow restriction.
Every agent must accept an explicit model and reasoning effort, including four
gpt-5.6-luna/high builders followed by one gpt-5.6-sol/medium design judge.
Preserve exact settings from task-level MCP input and workflow node definition
through validation, frozen node identity, persistence/replay and App Server
dispatch. Do not silently default, downgrade, substitute models, or reroute the
workflow through a different execution mechanism.

## Required reading and skills

Read AGENTS.md, GUIDELINES.md, README.md, TESTING.md, the BATDD profile and
worker contract, the named CAS-RP-01 assignment, relevant package documentation,
and predecessor CAS-09.R2/CAS-11.R2 evidence. Invoke seam, batdd, nx-monorepo,
openai-docs, agent-wiki, workflows, and ponytail. Read File System AND Clean Code.
New or materially rewritten code must satisfy both standards. Existing marked
structural debt is deferred to polish, not a precedent for new violations.

## Scope and known callers

- Workflow authoring currently types reasoning as medium and rejects other
  values in execution.ts. Durable run_workflow also rejects other efforts.
- The task-level MCP run_workflow schema omits reasoningEffort and injects medium.
- The App Server workflow executor already forwards request.reasoning as effort
  but its public request types admit only medium.
- Direct delegation accepts reasoningEffort but its turn/start request omits it.
  Trace initial launch AND continuation/resume/steer paths; do not fix only one.
- Inspect source and installed plugin schema/build consumers. A changed tool
  schema must not be claimed available to the desktop before actual discovery.

## Behavior contract

1. Every agent can specify its model and reasoning independently. Workflow-level
   profile settings must not erase explicit per-node settings.
2. Validate bounded, nonempty, safe model identifiers without a single-model
   hard-code. Resolve admitted reasoning vocabulary against the pinned App Server
   protocol/current official documentation; do not invent provider levels.
3. Unsupported model/effort combinations produce clear errors without fallback.
   Do not require all models to support every effort. Preserve explicit provider
   errors and no-launch rejection for malformed input.
4. Forward exact model/effort into real serialized App Server requests. Include
   mixed Luna-high and Sol-medium nodes, non-medium direct delegation, and
   continuation behavior in coverage. Prove no silent effort loss on replay.
5. Distinct runtime profiles must remain distinguishable in fingerprints and
   frozen execution records; retries must preserve chosen settings.
6. Preserve authorization, sandbox, approval, idempotency, cancellation,
   credential redaction, protocol-version admission and cleanup invariants.
7. Historical medium-only tests/documentation are superseded only where this
   Founder ruling changes that contract. Do not weaken unrelated assertions.
8. Specialized security audit/remediation routing remains unchanged. The demo
   judge assesses visual design and copy, not security or campaign acceptance.

## Execution and proof

Create a durable execution plan and basic/adversarial Green Contract before
product writes. Capture meaningful RED and freeze, then implement and run
affected Nx tests/build/lint/typecheck plus real controlled-process L2 proving
wire-level effort/model propagation. L3 belongs to subsequent CAS-12.R1 and
the user demo; this repair must not claim either dogfood complete.

No new packages or third-party dependencies. Use existing owners and explicit
exports; localize new files/tests per File System. A needed write outside the
assignment halts for coordinator amendment. You are not alone in the worktree:
preserve all unrelated edits and source MARK annotations.

## Restrictions and handoff

Do not launch the demo agents, new worker tasks, auditors, or other seams. Do
not configure daemon services, desktop/home credentials, Tailscale or remote
hosts. No commit/merge/push/publish/deploy. Do not overwrite installed plugin
cache: report any required rebuild/reinstall/reload as an explicit handoff.

Publish packages/testing/evidence/cas-rp-01-agent-runtime-profile-ready.json
with exact assignment/contract/candidate hashes, selected/executed nonzero
counts, commands, provider-wire evidence, affected gates, resource delta, and
remaining desktop deployment obligations. Stop without self-acceptance.

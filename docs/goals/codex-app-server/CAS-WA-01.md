# CAS-WA-01 — Workflow file admission and one-call launch

Role: Base implementation worker. Model: gpt-5.6-sol, medium reasoning.
Workspace: /Users/mcasa_atlantis/.codex/worktrees/a4a6/.codex only.
Terminal: WORKFLOW_AUTHORING_READY / READY-FOR-AUDIT or exact dependency halt.

## Objective and entry gate

Founder requires a Codex thread to write one trusted .workflow.ts file and submit
it once, receiving a durable run handle and complete Browser URL. Preserve the
existing defineWorkflow/agent/parallel/phase API. Codex App Server executes every
agent; the daemon owns workflow control flow, durable state and delivery.

Do not begin product writes until CAS-RP-01 supplies exact verified
AGENT_RUNTIME_PROFILE_READY evidence and its owner has stopped. Never overlap
its package/composition writes. Named config profiles remain deferred.

## Required context

Read AGENTS.md, GUIDELINES.md, README.md, TESTING.md, the compiled BATDD profile
and worker contract, this assignment and the current campaign DAG. Invoke seam,
batdd, nx-monorepo, workflows, openai-docs, agent-wiki and ponytail. File System
AND Clean Code apply to new code; existing marked debt remains polish scope.

## Public behavior

- Evolve the existing run_workflow public seam, not a second runner. The normal
  author-facing input is a trusted workflow source reference, input data, and
  optional explicit admitted host selection. Resolve available repository and
  assignment context from trusted caller context. Missing or ambiguous authority
  requires a clear error, not invented permissions or an arbitrary default host.
- Callers do not manually compile JavaScript, calculate source digests, edit
  daemon workflow registrations, or orchestrate App Server protocol requests.
  Retain the strict internal admission envelope and supported existing callers.
- Resolve and validate source within authorized roots before importing/executing
  it. Compilation/loading is trusted code execution, not a sandbox claim. Handle
  relative imports and bind executable/dependency identity so stale source or
  a changed dependency cannot silently execute under a previous digest.
- Register/admit and submit in one task-level call with retry-safe identity and
  one durable run. Preserve explicit per-node model/effort, budgets, sandbox,
  approvals, source ownership and host restrictions. Idempotency may use a stable
  caller request key; do not deduplicate intentional separate runs by source alone.
- Return stable runId and presentation.browserUrl; retain the skill's next-call
  Browser open/reuse behavior. Never claim a tab opened without Browser evidence.
- Local and admitted remote execution use the same App Server-backed path.
  Do not require moving remote credentials or arbitrary host paths into prompts.
- Teach the bundled Codex Control skill the compact authoring/launch pattern,
  with a minimal fan-out then synthesis example. Explain structured outputs only
  where needed and preserve explicit failure semantics.

## Exclusions

No new DSL, injected-global script format, framework, SDK runner, scheduler,
retry engine, dependency or package without coordinator approval. No promises
of Claude-equivalent sandboxing or replay merely from similar syntax. Do not
restore @openai/codex-sdk. Do not alter deferred structural debt wholesale.

## Validation and stop

Author a basic/adversarial Green Contract; meaningful RED before GREEN. Required
L1 covers admission, authority, compilation identity, errors and idempotency.
Required real L2 writes a fresh workflow file, submits through public MCP once,
observes App Server dispatch and stable presentation, retries without duplicates,
and rejects unauthorized/changed/malformed sources with cleanup. Exercise a
two-phase mixed model/effort workflow without hand-registering its module.
Existing source-reference callers must continue to work or receive an explicitly
approved migration. L3 user dogfood belongs to CAS-12.R1 after this seam.

Use Nx for affected tests/build/lint/typecheck. Keep one root/lockfile owner;
request a narrow amendment if a required path is absent. No real demo agents,
new tasks, auditors, remote mutations, home secrets, services, Tailscale routes,
installed-plugin writes, commit/merge/push/publish/deploy. Report any necessary
installed-plugin refresh or runtime setup as handoff obligations.

Publish packages/testing/evidence/cas-wa-01-workflow-authoring-ready.json with
exact source/assignment/contract identities, nonzero checks, real-boundary
evidence and zero unexpected resources. Stop without self-acceptance.

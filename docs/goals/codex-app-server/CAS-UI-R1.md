# CAS-UI-R1 — Diagnose and repair live workflow visibility

Role: Base repair owner. Model: gpt-5.6-sol, HIGH reasoning (Founder explicit).
Work only in /Users/mcasa_atlantis/.codex/worktrees/a4a6/.codex.
Terminal: LIVE_VISIBILITY_READY / READY-FOR-AUDIT or exact dependency halt.

## Objective

Repair the real production path so accepted/running workflows, phase progress,
all agent summaries, and selected-agent-only detail appear live in Codex Control.
Correctness must be proven through the assembled runtime and rendered UI, not
manually injected fixtures alone. The UI is a core Base requirement.

## Incident and immediate safety boundary

Founder halted dogfood workflow
workflow_6152f428a868f65c279a6c48ff50e05fbab57ecc9e1127b031fc7c91f330e057
(idempotency key marketing-demo-20260904-01). Cancel returned state failed,
cursor 200, cancellationRequested false. Durable events contain four node.started
and four node.failed; all four report HOST_CONNECTION_LOST during thread/read.
Judge never started. The visibility snapshot remained cursor 0 with no workflows.
The monitor is paused. Never resubmit, resume, retry, or launch demo agents.

Direct source inspection shows control-runtime creates visibility service but
does not call its observe method for execution events. Treat this as an observed
missing connection, not a complete diagnosis; trace all producers/consumers and
the connection-loss lifecycle before deciding the repair.

Before mutation/restart, inventory only this runtime's owned processes and jobs.
The coordinator's read-only attempt to inspect the four runtime threads returned
CONNECTION_CLOSED, so their liveness is not independently confirmed. Reconcile
or stop surviving owned test turns/processes under the Founder's HALT. Do not
kill unrelated Codex tasks, desktop processes or host servers. Do not restart a
service if it could replay paid work; demonstrate terminal/no-pending-job state.

## Required reading

Read repository AGENTS.md/GUIDELINES.md/README.md, TESTING.md, BATDD profile and
worker contract, named assignment, campaign plan, prior CAS-08/CAS-09.R2/CAS-WA-01
evidence and .agent/artifacts/marketing-agency-demo/run.json. Invoke seam, batdd,
nx-monorepo, workflows, codex-control, Browser, agent-wiki and ponytail. Read File
System AND Clean Code. Existing structural debt is deferred, new violations are not.

## Repair requirements

- Trace workflow/delegation/App Server events into normalization, durable
  visibility persistence, snapshot/wait queries and the actual Svelte view.
- Wire the existing visibility ingestor at its proper owner; no second event
  authority, polling broker, manual projection seeding or UI-only fake data.
- Preserve replay, bounded redaction/coalescing, monotonic cursors, deduplication,
  reconnect/restart, cancellation and reverse cleanup. Recover relevant durable
  state after restart so a failed run cannot look like no run ever existed.
- All agents contribute summary state; detail is transferred only for the
  selected agent. Switching/collapse cancels prior waits and rejects late data.
- Diagnose connection-loss contribution enough to distinguish source failure
  from projection failure. Request a separate bounded amendment if repair needs
  provider/transport files beyond this lease; do not broaden silently.
- Preserve actual source submission and approved per-node model/effort APIs.
- Meaningful RED must reproduce accepted/running work with an empty real UI.
  Use synthetic App Server children connected through production composition
  for parameter matrices and full event flow; then native Browser/Playwright
  checks of summary progress, selected feed and terminal/error display.
- Do not treat a hand-populated visibility store or mocked browser global as
  end-to-end proof. Run affected Nx gates and preserve unrelated greens.

## Local operational context

Runtime config: /Users/mcasa_atlantis/.codex/.runtime/codex-control-a4a6/runtime.json.
Service: com.codex.control.a4a6; loopback origin http://127.0.0.1:4765.
Isolated managed Codex home: /Users/mcasa_atlantis/.codex/.runtime/cc-a4a6.
Scoped database.env is beneath the runtime directory; load without printing.
Viewer service com.codex.control.a4a6.viewer and Tailscale port 9443 are read-only
ingress. Keep their configuration unchanged. No installed plugin/cache edits.

You may build and restart ONLY the owned daemon after safe queue/process
reconciliation, recording before/after identity. Do not alter real credentials,
auth symlink targets, database schemas, global config, other worktrees or remote
hosts. No broad SQL writes, truncation or evidence rewrites.

## Cost, scope and handoff

You are not alone; preserve unrelated edits. No child agents or additional
implementation tasks. Prefer zero provider inference. Any unavoidable live
validation obeys docs/plans/codex-control-live-test-budget.md: at most four,
GPT-5.6 low normally, one Sol-medium and one Luna/Terra-high exception only when
needed. Your Sol-high implementation seat does not authorize Sol-high tests.

No campaign audit, commit, merge, push, publishing, remote mutation, demo
continuation or preview launch. Record exact tests, source/evidence hashes,
observed UI results, baseline failures and resource delta in
packages/testing/evidence/cas-ui-r1-live-visibility-ready.json. Stop for coordinator
review and explicit user dogfood re-entry; do not self-certify BASE_READY.

# CAS-HOST-DIAG-01 — HOST_CONNECTION_LOST investigation

Role: read-only investigator. Model: gpt-5.6-sol, medium reasoning.
Workspace: /Users/mcasa_atlantis/.codex/worktrees/a4a6/.codex.

## Objective

Find the evidenced causal chain behind HOST_CONNECTION_LOST during thread/read
for all four builders in halted workflow
workflow_6152f428a868f65c279a6c48ff50e05fbab57ecc9e1127b031fc7c91f330e057.
Distinguish actual host exit, bridge/protocol disconnect, timeout, cleanup race,
or version mismatch. Do not infer root cause from the error name alone.

## Required context

Read AGENTS.md, GUIDELINES.md, README.md, relevant transport/App Server client,
workflow executor and daemon lifecycle source, and existing CAS-02/CAS-07/CAS-09.R2
evidence. Use openai-docs for precise protocol facts, seam for dependency analysis,
data-substrate for scoped durable reads and relevant repository skill routing.

The run started four Luna-high nodes; all later failed with HOST_CONNECTION_LOST
on thread/read. Durable log also contains workflow.failed and the delivery job
is completed with retry_count=1. Cancel returned already failed and did not
request cancellation. Judge never started. Subsequent direct read of the existing
Unix bridge returned CONNECTION_CLOSED for all four threads. These are observations,
not proof that every child process has stopped or that a retry launched agents.

Runtime: /Users/mcasa_atlantis/.codex/.runtime/codex-control-a4a6.
Managed home: /Users/mcasa_atlantis/.codex/.runtime/cc-a4a6.
Daemon service: com.codex.control.a4a6. Pinned App Server version: 0.151.0.
See .agent/artifacts/marketing-agency-demo/run.json for run identity. Load scoped
database environment without printing credentials; query only this incident.

## Boundaries and coordination

You are not alone. CAS-UI-R1 is repairing live visibility concurrently and owns
any authorized runtime cleanup/restart. You are READ-ONLY over product code,
processes, sockets, services, databases and remote systems. Do not run tests that
start agents or restart/kill/connect/resume threads. No provider inference.
No demo retries, profile/model substitutions, installed-plugin edits or fixes.
Read bounded logs and sanitized events; never print auth, environment dumps,
private reasoning, token contents or credential-bearing URLs.

Only report artifacts may be written under .agent/diagnostics/cas-host-diag-01/.
Do not run independently collected evidence against a moving source without
recording timestamp/hash and coordinating with the repair owner.

## Deliverable and stop

Produce a concise incident report with timeline, known process/socket identities,
exact error-origin code paths, competing hypotheses, decisive supporting and
contradictory evidence, cleanup uncertainty, and the smallest proposed repair
with affected files and a synthetic reproduction plan. Clearly separate verified
facts from inference and unresolved questions. Send findings to the coordinator;
do not implement or issue acceptance. No commit/push/audit/deploy or child tasks.

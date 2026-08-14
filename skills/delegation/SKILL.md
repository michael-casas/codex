---
name: delegation
description: Delegate substantial, long-running, or asynchronous work to a durable background Codex worker using a Herdr-managed agent when available or a detached non-interactive codex exec process in tmux as the portable fallback. Use when the user asks to hand off, delegate, background, parallelize, continue after the current turn, launch an external worker, or preserve an agent for later steering, especially when an ephemeral subagent would not survive the turn or provide an inspectable terminal and artifact handoff.
---

# Delegation

Launch a durable worker whose process, assignment, output, and stop boundary can
be inspected after the originating turn ends. Prefer Herdr for named,
interactive agent coordination and tmux for a portable non-interactive worker.

## Select the execution primitive

Use a durable worker when any of these apply:

- Work should continue after the current turn ends.
- The user wants a background or externally steerable agent.
- The task is long-running, produces a later artifact, or needs a monitor wake.
- Terminal/process identity and later transcript inspection matter.

Use an ephemeral subagent only for bounded fan-out that can finish inside the
current turn and does not need durable process identity, later steering, or a
cross-turn handoff. Do not replace an explicitly requested durable worker with
an ephemeral subagent.

Choose the durable backend:

1. **Herdr** when `HERDR_ENV=1` and the work benefits from a named persistent
   agent, interactive prompting, lifecycle state, pane output, or agent-to-agent
   handoff. Read [`references/herdr.md`](references/herdr.md).
2. **tmux** when Herdr is unavailable, portability is more important, or a
   non-interactive `codex exec` worker is sufficient. Read
   [`references/tmux.md`](references/tmux.md).
3. If the request explicitly names Herdr but `HERDR_ENV` is absent, follow the
   Forward-to-User recovery prompt in the Herdr reference. Do not silently
   substitute tmux unless the user accepts the changed control surface.

Before any Herdr control operation, run `herdr --skill` and follow the installed
contract. If the caller lacks `HERDR_ENV`, do not run agent, pane, workspace, or
session control commands; use the exact recovery guidance in
[`references/herdr.md`](references/herdr.md).

## Compile the assignment before launch

Record a compact assignment envelope containing:

- Stable delegation id and worker name.
- Role and concrete objective.
- Exact working directory and immutable input revisions when applicable.
- Required reading and governing instructions.
- Authorized read/write surface; preserve unrelated user changes.
- Explicit model, reasoning effort, approval policy, and sandbox mode.
- Ordered implementation or research steps.
- Required validation and evidence.
- Exact artifact/report path and terminal completion marker.
- Stop boundary, including whether commit, push, merge, cleanup, or deployment
  is forbidden or authorized.
- Handoff instructions for the originating task.

Do not delegate vague prompts such as “finish this.” The worker must be able to
decide whether it is complete without inventing scope. Delegation changes who
performs work, not what is authorized.

## Launch, observe, and wake

1. Inspect the current worktree and avoid overlapping write surfaces.
2. Launch through the selected backend with explicit runtime settings.
3. Confirm prompt delivery and stable worker identity.
4. Return the delegation id, backend, agent/pane or tmux session, artifact path,
   and observation command to the user.
5. When the originating task should resume automatically, use `$monitor` with
   a bounded condition on the declared artifact, marker, process exit, or Herdr
   lifecycle state. Read the monitor skill and its
   [`Herdr reference`](../monitor/references/herdr.md); do not create a second
   wake or retry mechanism.
6. End the turn when the user asked for true background execution. Do not keep
   a long tool call open merely to imitate durability.

## Verify the handoff

Treat agent `done`, pane quiet, tmux exit, and authored completion reports as
signals, not acceptance. On return:

1. Read the worker's final response and declared artifacts.
2. Inspect the actual diff and process/resource state.
3. Run or verify the required gates in the proper authority role.
4. Distinguish worker claims from independently verified facts.
5. Continue, repair, escalate, or close only within the original authorization.

## Safety and ownership

- Never expose credentials or raw sensitive environment values in prompts,
  logs, pane output, or artifacts.
- Do not grant `danger-full-access`, automatic approval, commit, push, merge, or
  deployment authority unless the assignment explicitly permits it.
- Use isolated worktrees for concurrent implementation lanes unless one
  serialized shared-worktree lease is explicitly authorized.
- Do not automate an interactive Codex TUI through tmux keystrokes. Use
  non-interactive `codex exec` for the tmux backend.
- Do not close or delete Herdr panes, tmux sessions, worktrees, or artifacts the
  delegation did not create.
- Clean up owned temporary prompt/log files and completed transport resources
  only after the handoff evidence is secured.

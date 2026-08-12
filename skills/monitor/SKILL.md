---
name: monitor
description: "Wait for timers, files, content, process exits, or successful commands using either a foreground synchronous turn stall or a durable tmux-backed monitor with same-task wake delivery. Use the synchronous shim inside active `/goal` loops when reprompting would compete with the current turn; use the durable monitor when Codex should end the turn and wake later; also use for lifecycle inspection, cancellation, or dispatcher inputs matching `$monitor | handle: UUID`."
---

# Monitor

Use the bundled shim to arm a condition in a detached tmux session. The Node
worker is the pane's primary process, survives the originating turn, persists
one terminal wake payload, and tears down its tmux session when it exits. A
Codex Desktop heartbeat polls that state and returns to the originating task
through the app-owned writer when the payload becomes ready.

## Canonical terminology

- **Monitor**: the tool and durable condition-watching process.
- **Condition**: the predicate the monitor evaluates.
- **Wake event**: the automated prompt emitted after a terminal transition.
- **Boomerang**: same-task reprompting through a host-owned Desktop heartbeat.
- **Boomerang environment**: the detached tmux session that keeps the monitor alive.

Never call the tool itself a boomerang. Every generated wake prompt must begin
with the exact first line `MONITOR EVENT`.

## Choose the wait mode

- Use the **synchronous turn stall** when the current Codex turn must remain
  suspended, especially inside a `/goal` loop where a new prompt or checkpoint
  would compete with the active goal turn.
- Use the **durable monitor** when the current turn should end and Codex must be
  returned to the task later through the Desktop heartbeat.

Never arm both modes for the same condition. Read
[`references/synchronous-stall.md`](references/synchronous-stall.md) before a
foreground stall. The synchronous mode emits no wake event, creates no
heartbeat, and does not reprompt the task.

**NEVER FIRE THE SYNCHRONOUS SHIM IN A BACKGROUND TERMINAL. IT IS AN INTENDED
TURN STALL.** Do not run it in tmux, detach it, suffix it with `&`, or launch it
through a background execution facility.

## Dispatch a scheduled heartbeat

Treat an input matching exactly this form as an internal dispatcher invocation,
not as a request to arm another monitor:

```text
$monitor | handle: <HANDLE_ID>
```

Require `<HANDLE_ID>` to be a canonical UUID. Then:

1. Run the absolute monitor shim with `poll --handle <HANDLE_ID>`.
2. If `ready=false` and `stop=false`, stop silently with no user-facing report.
3. If `stop=true`, delete the current heartbeat using `automation_id` from its
   envelope, then stop silently.
4. If `ready=true`, preserve `wakeText` byte-for-byte and call the Codex app
   `send_message_to_thread` tool with `threadId` from the poll result and
   `prompt` equal to exact `wakeText`. Omit model and thinking.
5. If message submission fails, do not acknowledge or delete the heartbeat;
   stop silently so its next run can retry.
6. Only after message submission succeeds, run `acknowledge --handle
   <HANDLE_ID> --delivery host-message-accepted`, delete the heartbeat, and
   stop silently.

Never return, print, summarize, or paraphrase `wakeText` as the dispatcher
response. The queued follow-up must be the only `MONITOR EVENT` presented to
the origin task and must start its separate actionable turn. Do not modify
files or continue unrelated work during dispatch.

## Arm a monitor

Invoke the shim from this skill directory:

```bash
"${CODEX_HOME:-$HOME/.codex}/skills/monitor/scripts/monitor" arm \
  --condition '<condition-json>' \
  --memo '<what the waking agent should do next>'
```

The shim reads the current thread from `CODEX_THREAD_ID` or
`CODEX_SESSION_ID`. Pass `--thread-id` only when arming for another known local
thread. Pass `--cwd` when the wake must resume in a different working directory.

Supported conditions:

```json
{"kind":"timed","seconds":120}
{"kind":"file_exists","path":"/absolute/or/cwd-relative/path"}
{"kind":"file_matches","path":"build.log","contains":"READY"}
{"kind":"file_matches","path":"build.log","pattern":"READY|DONE"}
{"kind":"process_exit","pid":12345}
{"kind":"custom_command","command":"test -f dist/report.json"}
```

For every non-`timed` condition, require `--timeout-seconds`. The default poll
interval is 10 seconds; override it with `--interval-seconds`. Use
`--on-timeout exit_zero_with_timeout_marker` only when a timeout is an expected
soft wake; the default is `exit_nonzero`.

The `memo` is operational context, not a vague reminder. Include the next
action, relevant artifact or target, and what success means.

After the shim returns a handle, create a one-minute heartbeat in the current
task with the app automation tool. Its prompt must be exactly the single line
returned by:

```bash
monitor dispatcher-prompt --handle <HANDLE_ID>
```

The output and scheduled-task prompt must be exactly:

```text
$monitor | handle: <HANDLE_ID>
```

Do not embed polling commands, thread ids, dispatch rules, or operational prose
in the scheduled prompt; this skill owns that contract.

Use `RRULE:FREQ=MINUTELY;INTERVAL=1`. The heartbeat is the supported host-owned
dispatcher; it does not replace the tmux condition watcher. Never use a
standalone scheduled task for this relay because it would create a new task
instead of returning to the armed origin task.

## Lifecycle commands

```bash
monitor list
monitor list --active
monitor status --handle <uuid>
monitor poll --handle <uuid>
monitor dispatcher-prompt --handle <uuid>
monitor acknowledge --handle <uuid> --delivery host-message-accepted
monitor trace --handle <uuid> --lines 100
monitor flush --handle <uuid>
monitor flush-all
```

If `monitor` is not in `PATH`, use the absolute skill shim path shown above.
`flush` aborts the monitor without emitting a wake event. `process_exit` never
kills the target process. `custom_command` owns only the shell process it
starts and terminates that owned process group on timeout or abort.

## Implementation map

Find the implementation under
`${CODEX_HOME:-$HOME/.codex}/skills/monitor/`; on this host the canonical path
is `/Users/mcasa_atlantis/.codex/skills/monitor/`.

- [`scripts/monitor`](scripts/monitor): executable shell entry point.
- [`scripts/monitor.mjs`](scripts/monitor.mjs): CLI, state inspection,
  dispatcher-prompt generation, acknowledgement, and tmux lifecycle.
- [`scripts/monitor-worker.mjs`](scripts/monitor-worker.mjs): detached worker
  and terminal wake persistence.
- [`scripts/monitor-conditions.mjs`](scripts/monitor-conditions.mjs): condition
  polling implementations.
- [`scripts/monitor-core.mjs`](scripts/monitor-core.mjs): validation, stable
  keys, wake payloads, compact dispatcher prompts, and atomic persistence.
- [`scripts/monitor.test.mjs`](scripts/monitor.test.mjs): deterministic and
  tmux-backed regression coverage.
- [`scripts/sync-monitor.mjs`](scripts/sync-monitor.mjs): foreground file
  existence/content stall for the current active turn.
- [`references/protocol.md`](references/protocol.md): protocol, state machine,
  delivery semantics, and persistence layout.
- [`references/synchronous-stall.md`](references/synchronous-stall.md):
  selection, invocation, exit semantics, and `/goal`-loop rules for the
  synchronous stall.

Read only the owning file for routine maintenance. Read
[`references/protocol.md`](references/protocol.md) before changing conditions,
states, wake delivery, acknowledgement, or timeout semantics.

## Operating procedure

1. Translate the user's request into one supported condition and a concrete memo.
2. Confirm a bounded timeout for non-timed conditions.
3. Arm the monitor and create its host-owned heartbeat with the exact compact
   `$monitor | handle: <HANDLE_ID>` prompt.
4. Report the handle, automation id, tmux session, worker PID, condition, and trace path.
5. Verify the returned tmux session and worker PID are alive. Do not wait inside the current tool call.
6. End the turn when the user asked to be woken later.
7. On `MONITOR EVENT`, use its outcome, target, memo, and diagnostics to continue the same task.
8. Inspect `trace` and the scheduled-task run before diagnosing a missing wake.

## Invariants and safety

- Emit at most one wake per arm.
- Treat host message acceptance as the acknowledgement boundary. Never
  acknowledge based only on polling or before `send_message_to_thread` succeeds.
- Deduplicate equivalent active conditions only within the same target thread.
- Preserve the condition string exactly at the `/bin/sh -c` boundary; do not
  add another interpolation layer.
- Do not arm destructive or unauthorized commands merely because monitoring is
  asynchronous. The monitor changes timing, not authorization.
- Require `tmux`. The shim launches one uniquely named detached session per
  monitor and makes the worker the pane's primary process. The session exits
  automatically after wake completion, wake failure, timeout, or abort.
- Never call `resumeThread`, `codex resume`, or a separately spawned App Server
  for wake delivery. Those paths compete with Desktop's active writer and do
  not reliably live-render in the app.
- Preserve model affinity: create the heartbeat without model or reasoning
  overrides. The monitor must never switch models on wake because doing so can
  invalidate the originating task's cache.
- Treat deferred Pi-only kinds (`kanban_terminal`, `cmux_agent_stop`) as schema
  vocabulary, not supported Codex monitor conditions.

Read [references/protocol.md](references/protocol.md) when implementing a new
condition kind, changing state transitions, or interpreting timeout/wake payloads.

# Monitor protocol

## Terms

The monitor watches a condition. A terminal condition emits a wake event. A
boomerang is the delivery pattern that returns to the originating Codex task.
The detached tmux session is the condition-watching environment. The Node
worker is the pane's primary process, and tmux removes the session automatically
after it persists a terminal wake payload, fails, times out, or is aborted. A
host-owned Desktop heartbeat performs delivery through the active app writer.

Every wake event starts with:

```text
MONITOR EVENT
```

## Request contract

The Codex shim mirrors the Pi monitor V1 request:

```json
{
  "condition": { "kind": "timed", "seconds": 120 },
  "interval_seconds": 10,
  "timeout_seconds": 130,
  "memo": "Continue the originating task and inspect the completed artifact.",
  "on_timeout": "exit_nonzero",
  "background": true,
  "notify_on_complete": true
}
```

`condition` and `memo` are required. `background` and `notify_on_complete` are
always true. Non-timed conditions require `timeout_seconds`; timed conditions
default to `seconds + 10`.

Supported kinds:

- `file_exists`: `{kind, path}`
- `file_matches`: `{kind, path, pattern? , contains?}` with at least one matcher
- `process_exit`: `{kind, pid}` where PID is positive
- `timed`: `{kind, seconds}` where seconds is positive
- `custom_command`: `{kind, command}`; exit 0 means met, nonzero means poll again

Pi vocabulary retained but rejected before arming:

- `kanban_terminal`: Hermes-only in the source implementation
- `cmux_agent_stop`: deferred in the source implementation

## Synchronous stall boundary

The skill's `scripts/sync-monitor.mjs` launcher routes to the workspace-owned
`apps/codex-monitor/scripts/sync-monitor.mjs` foreground adapter. It polls one regular file for existence or optional
content, keeps the invoking tool call pending, and exits in that same turn. It
does not create a monitor handle, tmux session, persisted state, wake payload,
Desktop heartbeat, or boomerang.

Use this adapter for `/goal` loops when a separate checkpoint or task reprompt
would compete with the active goal turn. Require a bounded timeout. Do not arm
the durable monitor for the same condition.

## State machine

```text
armed → active → met
               → timed_out
               → aborted
               → error
```

Only the first terminal transition wins. Completion, timeout, and error emit
one wake. Abort performs cleanup and emits no wake.

## Wake payload

Wake text attributes:

- monitor handle
- `outcome`: `met`, `timed_out`, or `error`
- `status`: `completed`, `timeout`, or `failed`
- condition kind and concrete target
- memo
- timeout marker when applicable
- captured command stdout/stderr when applicable

The worker never invokes the Codex SDK, `codex resume`, or a separately spawned
App Server. After a terminal condition it persists `wake.status` as
`awaiting_host_dispatch`, stores the exact wake text, records the
`desktop-heartbeat` backend, and exits. `monitor poll --handle <uuid>` exposes
that payload to a one-minute heartbeat attached to the originating task.

The heartbeat prompt is exactly one line:

```text
$monitor | handle: <HANDLE_ID>
```

The monitor skill owns all dispatcher behavior. Never duplicate commands,
thread ids, retry rules, acknowledgement ordering, or safety prose in the
scheduled prompt.

The heartbeat runs through Codex Desktop's active writer. While the payload is
not ready it stops without a user-facing report. When ready, it captures the
exact `wakeText` and invokes the Codex app `send_message_to_thread` tool with
the armed origin thread id and `prompt: wakeText`. It omits model and thinking,
so the queued turn inherits the origin task's settings.

Only after `send_message_to_thread` accepts the follow-up does the dispatcher
invoke `monitor acknowledge --handle <uuid> --delivery
host-message-accepted`, delete itself, and stop silently. Acknowledgement
transitions the wake to `host_message_accepted` and records transport
`send_message_to_thread`; it does not claim independently verified visual
delivery. If submission fails, the dispatcher neither acknowledges nor deletes
itself, allowing the next heartbeat to retry.

The dispatcher must never return, print, summarize, or paraphrase `wakeText`
as its own response. The queued follow-up is the wake event and starts the
separate actionable Codex turn in the origin task.

## Persistence layout

Runtime data lives under `${CODEX_MONITOR_HOME}` or, by default,
`${CODEX_HOME}/monitors`:

```text
monitors/
├── handles/<uuid>.json
└── logs/<uuid>.jsonl
```

The state file is authoritative. The JSONL trace records scheduling, state
transitions, condition observations, wake dispatch, completion, and failures.
Worker stdout/stderr is redirected to a separate diagnostic log so it cannot
corrupt the JSONL trace.

Each state file records `launcher: "tmux"` and its unique `tmuxSession` name.
Successful and failed workers self-teardown because the worker is the pane's
primary process and `remain-on-exit` is forced off. `flush` sends `SIGTERM` to
the worker so it can persist `aborted` before the session disappears. The next
heartbeat poll observes the suppressed wake, removes its own automation, and
stops. `status` and `trace` compute `runtime.workerAlive` and
`runtime.tmuxSessionAlive` so a stale session is distinguishable from a
completed persisted monitor.

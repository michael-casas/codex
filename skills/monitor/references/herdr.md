# Herdr-backed monitors

Use this reference when a monitor condition depends on a Herdr-managed agent or
pane. Read the installed Herdr contract with `herdr --skill` before control
operations; the installed CLI and `herdr api schema --json` are authoritative.

## Available now

Herdr-backed conditions currently use monitor's supported `custom_command`
kind. The monitor still runs in tmux and still delivers its wake through the
Codex Desktop heartbeat. Herdr supplies the condition only.

Before arming, require the caller to be inside Herdr:

```bash
test "${HERDR_ENV:-}" = 1
```

The current tmux launcher does not explicitly propagate Herdr variables, and a
long-lived tmux server may have a stale environment. Capture the Herdr binary
and socket into the condition command at arm time; do not assume the worker
will inherit them. This stores the local socket path in monitor runtime state,
so never copy the condition into wake text, reports, or committed artifacts.

Use a unique live agent name or an explicit pane id. Inspect rather than infer:

```bash
herdr agent list
herdr agent get <target>
```

### Agent status

`herdr agent wait` recognizes `idle`, `working`, `blocked`, `done`, and
`unknown`. Without `--until`, it accepts the settled states `idle`, `done`, or
`blocked`. Prefer an exact terminal status for monitor conditions:

```bash
herdr_bin="$(command -v herdr)"
condition="$(jq -cn \
  --arg herdr "$herdr_bin" \
  --arg socket "$HERDR_SOCKET_PATH" \
  --arg target 'researcher_1' \
  '{kind:"custom_command",command:("HERDR_ENV=1 HERDR_SOCKET_PATH=" + ($socket|@sh) + " " + ($herdr|@sh) + " agent wait " + ($target|@sh) + " --until done --timeout 5000 >/dev/null 2>&1")}')"

monitor arm \
  --condition "$condition" \
  --timeout-seconds 1800 \
  --memo 'Researcher 1 reached done. Read its attributed artifact, verify its completion contract, and continue the originating orchestration lane.'
```

The short inner timeout allows monitor's existing command poller to retry. The
outer `--timeout-seconds` is the authoritative bounded monitor timeout.

To wake on either success or a request for intervention, arm separate monitors
for `done` and `blocked`, or use a bounded shell condition that treats either
state as met and make the waking turn inspect `herdr agent get <target>` before
acting. Do not interpret `unknown` as completion.

### Pane output marker

Wait for a literal completion marker already present or emitted later:

```bash
herdr_bin="$(command -v herdr)"
condition="$(jq -cn \
  --arg herdr "$herdr_bin" \
  --arg socket "$HERDR_SOCKET_PATH" \
  --arg pane 'w2:p2' \
  --arg marker 'READY_FOR_EXTERNAL_AUDIT' \
  '{kind:"custom_command",command:("HERDR_ENV=1 HERDR_SOCKET_PATH=" + ($socket|@sh) + " " + ($herdr|@sh) + " pane wait-output " + ($pane|@sh) + " --match " + ($marker|@sh) + " --timeout 5000 >/dev/null 2>&1")}')"

monitor arm \
  --condition "$condition" \
  --timeout-seconds 1800 \
  --memo 'The Herdr worker emitted READY_FOR_EXTERNAL_AUDIT. Read and verify the declared audit artifact before continuing.'
```

Use `--regex` only when a literal marker is insufficient. Prefer stable,
contract-owned markers and artifact paths over broad transcript phrases.

### Operator notification

Herdr notifications are optional operator feedback, never wake delivery:

```bash
herdr notification show "Monitor completed" \
  --body "Herdr agent researcher_1 is ready." \
  --position bottom-right \
  --sound done
```

A notification may report `shown`, `disabled`, `rate_limited`,
`no_foreground_client`, or `busy`. A failure to show must not alter monitor
completion, acknowledgement, or same-task wake delivery.

## Identity and lifecycle rules

- Resolve names before arming. Agent names are live aliases and can be cleared
  or reused.
- Record the resolved pane id and agent session reference in monitor metadata
  when implementation support exists. A moved pane receives a new
  workspace-qualified pane id.
- Treat `done` as Herdr's settled, unseen-background-work state. Focusing the
  agent can change `done` to `idle` by marking it seen.
- Treat `blocked` as a request for input or approval, not a failed task.
- Treat a pane exit, replacement agent, stale socket, or protocol mismatch as a
  diagnostic/error outcome rather than successful completion.
- Keep monitor detection separate from orchestration authority. A monitor may
  wake a coordinator; it must not independently accept work, retry jobs, or
  advance reducer-owned state.
- Keep Desktop heartbeat delivery unchanged. Never use `codex resume`, a
  second App Server, terminal injection, or a Herdr notification as the
  same-task boomerang transport.

## Socket capabilities

Herdr exposes a newline-delimited JSON protocol on `HERDR_SOCKET_PATH`.
Handshake with `ping` and validate the installed protocol using:

```bash
herdr status server
herdr api schema --json
```

Protocol 19 / schema version 1 currently describes these useful methods:

- `agent.wait`
- `pane.wait_for_output`
- `events.wait` for one exact event
- `events.subscribe` for a long-lived event stream
- `notification.show`

Relevant events include `pane_agent_detected`,
`pane_agent_status_changed`, `pane_output_changed`, `pane_exited`, and pane,
tab, or workspace lifecycle changes. Treat the generated schema as the source
of truth; do not freeze protocol 19 into monitor code without compatibility
negotiation.

## FUTURE

These are opportunities for the canonical `${CODEX_HOME:-$HOME/.codex}` Nx
workspace, not claims about the current monitor implementation.

### Native Herdr condition adapters

Add typed monitor conditions backed directly by the socket rather than repeated
shell polling:

```json
{"kind":"herdr_agent_status","target":"researcher_1","statuses":["done","blocked"],"transition":"next"}
{"kind":"herdr_pane_output","paneId":"w2:p2","contains":"READY_FOR_EXTERNAL_AUDIT"}
{"kind":"herdr_pane_exit","paneId":"w2:p2"}
{"kind":"herdr_agent_detected","paneId":"w2:p2"}
```

Implement a small socket client in the owning `apps/codex-monitor` project
with ping negotiation, `events.wait`, `events.subscribe`, timeout and abort
handling, reconnect policy, and clean disconnect. Preserve the existing
persisted wake and Desktop heartbeat transport.

Pass an explicit, arm-time Herdr environment envelope to the worker rather than
depending on tmux server environment. Keep the socket path in private runtime
state and redact it from wake payloads and operator-facing traces.

### Transition-safe identity

At arm time, resolve and persist the workspace id, pane id, agent session
reference, and current `state_change_seq`. Support explicit semantics:

- `current_or_next`: an already-satisfied state may fire immediately.
- `next`: require a state transition newer than the arm-time sequence.

Default orchestration handoffs to `next` so stale `done` state cannot satisfy a
new assignment. Detect pane movement, replacement, closure, and agent-session
changes explicitly.

### Composite event conditions

Add typed composition without creating a second workflow or retry authority:

- `all`: wake when every delegated Herdr agent is done.
- `any`: wake when any agent is blocked, exits, or emits an error marker.
- Artifact barrier: require both agent completion and a verified artifact.
- Watchdog: wake when an agent remains `unknown` or `blocked` beyond a bound.

Persist every contributing observation and produce one terminal monitor wake.
Leave retries and durable job transitions to the PostgreSQL process control
plane and pg-boss.

### Herdr launcher backend

Explore `launcher: "herdr"` for monitor workers when `HERDR_ENV=1`, with tmux
as a portable fallback. Prove durable process identity, restart reconciliation,
pane ownership, descendant cleanup, and automatic teardown before making it
canonical. A Herdr pane remaining after worker exit is not acceptable cleanup.

This launcher concerns where the condition watcher lives; it must not replace
the host-owned Desktop heartbeat used for same-task delivery.

### Agent-to-agent handoff contracts

Define a typed handoff envelope carrying source and target agent identity,
assignment id, immutable artifact paths and digests, completion marker, stop
boundary, and monitor handle. Allow a completed Herdr agent to wake the
originating coordinator, which validates the artifact before prompting the next
agent. Do not let terminal state or authored reports become acceptance proof.

### Event projection into the data substrate

Project Herdr observations into PostgreSQL as attributed events when durable
orchestration needs cross-process history. Keep Herdr as the live terminal and
agent sensor, PostgreSQL as durable process/event truth, the deterministic
reducer as the sole state-transition authority, and pg-boss as the sole retry
and delivery-timing authority.

The target architecture is event-driven Codex orchestration: agents may finish
and relinquish their turns, Herdr emits attributable lifecycle events, monitor
reduces those events to one durable wake, and the exact originating Codex task
reacts only when useful work or intervention is ready.

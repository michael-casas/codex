# Synchronous turn stall

> **HARD RULE — NEVER FIRE IN A BACKGROUND TERMINAL. THIS SHIM IS AN INTENDED
> TURN STALL.** Run it only as the foreground process of the current Codex tool
> call. Never run it in tmux, a detached shell, a background execution, with
> `&`, or through a scheduled task.

Use `scripts/sync-monitor.mjs` to keep the current Codex tool call pending
until one regular file exists or its content matches. This mode is the
Founder-designated foreground shim adapted from:

`~/Documents/repos/github.com/atlantis-electrical/atlantis-electrical/.agent/shims/monitor.js`

## Invocation

```bash
"${CODEX_HOME:-$HOME/.codex}/skills/monitor/scripts/sync-monitor.mjs" \
  .agent/audit/workflows/<ATTEMPT_ID>/AUDIT.md \
  --timeout 3600 \
  --interval 500
```

Optional content gates:

```bash
sync-monitor.mjs report.md --contains "EXTERNAL_AUDIT_COMPLETE" --timeout 3600
sync-monitor.mjs report.md --regex "Canonical score: [45]/5" --timeout 3600
```

The no-matcher form is equivalent to bounded `test -f` polling. Paths resolve
against the invocation working directory. The target must be a regular file.

## `/goal` loop law

Use this mode when the active `/goal` turn must stall on a condition. Keep the
foreground process attached to the current tool call; if the host yields a
running execution handle, continue waiting on that same handle. Do not end the
turn, create a scheduled heartbeat, emit a wake prompt, or reprompt the goal.

Require a bounded timeout and communicate progress at least once per minute
while the tool remains active. Do not arm the durable monitor for the same
condition.

## Exit contract

- `0`: the regular file exists and the optional matcher passed;
- `64`: invalid invocation;
- `124`: timeout;
- `130`: interrupted with SIGINT;
- `143`: terminated with SIGTERM.

The shim prints `WAITING <absolute-path>` once and `CONDITION_MET
<absolute-path>` on success. It persists no state and performs no wake
delivery.

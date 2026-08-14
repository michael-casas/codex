# Herdr delegation

Use Herdr for durable named workers that the originating Codex task or user may
prompt, inspect, steer, and monitor later.

## Preflight

Verify the caller context before any control command:

```bash
test "${HERDR_ENV:-}" = 1
herdr --skill
```

The installed `herdr --skill` contract and CLI help are authoritative. Use an
explicit `--session <name>`, unique agent name, or pane id; never rely on
another client's focused pane.

If `HERDR_ENV` is absent, read
[`../../monitor/references/herdr.md`](../../monitor/references/herdr.md) and
follow its capability negotiation. Herdr-required work must pause for recovery;
backend-agnostic durable work may use the tmux reference instead.

## Forward-to-User recovery prompt

When `HERDR_ENV` is absent, send the following prompt to the user before any
Herdr control attempt. Replace `aes` only when the user named another session:

```text
Herdr is installed, but this Codex task was not launched with a Herdr caller
context (`HERDR_ENV` is missing). To enable durable Herdr delegation:

1. Start or attach the session with `herdr --session aes`.
2. From Herdr, invoke the detached ChatGPT guardian binding: press the Herdr
   prefix, then `alt+h`.
3. If that binding is not configured, run
   `$HOME/.local/bin/codex-app-herdr --watch` from a Herdr-managed pane.
4. Let ChatGPT quit and relaunch, then retry from a fresh Codex task.

The canonical launcher source is
`$HOME/.codex/scripts/launch-chatgpt-in-herdr`, normally exposed as
`$HOME/.local/bin/codex-app-herdr`. Relaunching ChatGPT may disconnect this
active task, so I will not trigger it without warning. If you only need a
durable non-interactive background worker, I can use tmux instead.
```

Before sending the prompt, these read-only checks are allowed outside Herdr:

```bash
command -v herdr
command -v codex-app-herdr
codex-app-herdr --status
```

Do not print Herdr environment values. If `codex-app-herdr --status` already
reports `herdr-inherited` but `HERDR_ENV` is missing, explain that the current
task or app-server may predate the corrected environment policy; request a
ChatGPT restart and a fresh task rather than steering another client's session.

## Launch a Codex worker

Inspect before creating anything:

```bash
herdr --session <session> agent list
herdr --session <session> pane list --workspace <workspace-id>
```

When no suitable shell pane exists, create a sibling without stealing focus:

```bash
herdr --session <session> pane split --current \
  --direction right --cwd <working-directory> --no-focus
```

Read the returned pane id from `.result.pane.pane_id`; do not predict it. Start
a uniquely named Codex agent and pass explicit native arguments after `--`:

```bash
herdr --session <session> agent start <worker-name> \
  --kind codex --pane <pane-id> -- \
  --model <model> \
  -c 'model_reasoning_effort="<effort>"' \
  -c 'approval_policy="<policy>"' \
  --sandbox <sandbox-mode>
```

Choose permissions from the assignment; do not default to maximum authority.
Submit the compiled assignment atomically:

```bash
herdr --session <session> agent prompt <worker-name> "<assignment>"
```

Omit `--wait` for true background execution. The prompt command must report
successful submission; otherwise inspect the target before retrying.

## Observe and hand off

Use the agent surface rather than raw pane keystrokes:

```bash
herdr --session <session> agent get <worker-name>
herdr --session <session> agent read <worker-name> \
  --source recent-unwrapped --lines 120
herdr --session <session> agent wait <worker-name> \
  --until done --timeout 120000
```

`done` means settled unseen work, not acceptance. `blocked` means the agent is
requesting input or approval. `unknown` does not prove completion.

For a cross-turn return, arm `$monitor` against the resolved agent/pane or a
stable artifact marker. The monitor Herdr reference owns socket capture,
lifecycle caveats, and same-task wake delivery. Herdr notification is optional
operator feedback and must not become a second wake authority.

## Continue or clean up

Prompt the same named agent for bounded continuation when its role and authority
remain unchanged. Start a fresh agent when independence, role, or judgment
authority changes. Close only panes and agents created by this delegation, and
only after the user or assignment authorizes cleanup.

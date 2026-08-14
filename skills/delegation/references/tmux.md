# tmux delegation

Use tmux as the portable fallback for a detached, non-interactive Codex worker.
This backend provides process durability and logs, not Herdr agent discovery,
interactive lifecycle state, or pane-aware handoff.

## Preflight

```bash
command -v tmux
codex exec --help
```

Use the installed Codex help as the authority for current flags. Validate a
filesystem-safe delegation id and choose paths outside product source for the
prompt and transport log. Keep the required final artifact inside the
assignment's authorized write surface.

## Prepare deterministic inputs

Create these with `apply_patch`, not shell interpolation:

- A complete prompt envelope at a private temporary or ignored path.
- A transport log path.
- An `--output-last-message` path that appears only after the worker finishes.

The prompt must declare the model, reasoning, permissions, working directory,
write surface, validation, artifact path, completion marker, and stop boundary.

## Launch non-interactively

Use one uniquely named detached session whose primary process is `codex exec`:

```bash
tmux new-session -d -s "codex-delegate-<id>" \
  "exec codex exec \
    --model '<model>' \
    -c 'model_reasoning_effort=\"<effort>\"' \
    -c 'approval_policy=\"<policy>\"' \
    --sandbox '<sandbox-mode>' \
    --cd '<working-directory>' \
    --output-last-message '<result-path>' \
    - < '<prompt-path>' > '<log-path>' 2>&1"
```

Use validated paths and values before composing the shell boundary. Never place
secrets in the prompt or command line. Do not add
`--dangerously-bypass-approvals-and-sandbox` unless the user explicitly grants
that authority and an external sandbox makes it appropriate.

Confirm launch without attaching:

```bash
tmux has-session -t "codex-delegate-<id>"
tmux list-panes -t "codex-delegate-<id>" \
  -F '#{session_name} #{pane_id} #{pane_pid} #{pane_current_command}'
```

Do not drive an interactive Codex TUI with `send-keys`. If the assignment must
be revised materially, stop within authorization and launch a new compiled
non-interactive assignment or use Herdr for interactive steering.

## Observe and return

Inspect bounded output without attaching:

```bash
tmux capture-pane -p -t "codex-delegate-<id>" -S -200
test -s '<result-path>'
```

For a cross-turn return, use `$monitor` with a bounded `file_exists`,
`file_matches`, or `process_exit` condition. The monitor already owns its own
tmux watcher; do not confuse the delegation session with the monitor's
boomerang environment.

The delegation session normally disappears when `codex exec` exits. Preserve
the result and log long enough to verify the worker's claims, then remove only
temporary resources created for this delegation.

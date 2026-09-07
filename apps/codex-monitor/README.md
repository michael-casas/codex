# Codex Monitor

TypeScript/Bun implementations of the tmux-backed durable monitor, foreground
synchronous wait adapter, and disposable App Server same-task wake spike.

Run all checks through Nx. The App Server spike's `arm` command writes an
append-only trace and state document below
`~/.codex/monitors/app-server-spike/`. Historical wire labels containing
`python-spike` remain unchanged for persisted-state and marker compatibility;
the runtime has no Python dependency.

# Codex Monitor App Server Spike

Disposable Python shim for testing same-task wake delivery through Codex App
Server. This is not yet the production monitor and does not replace the
tmux-backed TypeScript monitor.

Run all checks through Nx. The real `arm` command writes an append-only trace
and state document below `~/.codex/monitors/app-server-spike/`.


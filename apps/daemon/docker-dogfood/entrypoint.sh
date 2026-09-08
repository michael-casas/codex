#!/bin/bash
set -euo pipefail
umask 077
runtime_group=$(id -gn codex)
install -d -m 700 -o codex -g "$runtime_group" /home/codex/.codex
install -m 600 -o codex -g "$runtime_group" /mnt/host-codex/auth.json /home/codex/.codex/auth.json
install -m 600 -o codex -g "$runtime_group" /run/cas-secrets/token /home/codex/.codex/wss-token
chown codex:"$runtime_group" /workspace
gosu codex codex app-server --listen ws://127.0.0.1:4500 --ws-auth capability-token --ws-token-file /home/codex/.codex/wss-token &
server=$!
nginx -g 'daemon off;' &
proxy=$!
trap 'kill -TERM "$server" "$proxy" 2>/dev/null || true; wait || true' EXIT
trap 'exit 0' TERM INT
wait -n "$server" "$proxy"

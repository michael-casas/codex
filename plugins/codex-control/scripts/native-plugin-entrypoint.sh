#!/bin/bash
set -euo pipefail
umask 077
runtime_group=$(id -gn codex)
install -d -m 700 -o codex -g "$runtime_group" /home/codex/.codex /workspace
if [[ -f /mnt/cas-native-plugin-secrets/token ]]; then
  install -m 600 -o codex -g "$runtime_group" \
    /mnt/cas-native-plugin-secrets/token /home/codex/.codex/control-token
fi
if [[ -f /mnt/cas-native-plugin-secrets/auth.json ]]; then
  install -m 600 -o codex -g "$runtime_group" \
    /mnt/cas-native-plugin-secrets/auth.json /home/codex/.codex/auth.json
fi
exec gosu codex node /opt/cas-native-plugin-gate/native-plugin-container.mjs

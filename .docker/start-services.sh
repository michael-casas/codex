#!/bin/zsh

set -u

readonly docker_bin="/usr/local/bin/docker"
readonly compose_file="/Users/mcasa_atlantis/.codex/docker-compose.yaml"

if ! "$docker_bin" info >/dev/null 2>&1; then
  /usr/bin/open -gja Docker
fi

for attempt in {1..60}; do
  if "$docker_bin" info >/dev/null 2>&1; then
    exec "$docker_bin" compose --file "$compose_file" up --detach
  fi
  /bin/sleep 2
done

echo "Docker did not become ready within 120 seconds" >&2
exit 1


# Redis

Use Redis for caches, TTL-bound state, rate limits, counters, deduplication, locks, queues, pub/sub,
sessions, and fast coordination between Codex agents or local processes.

## Connection

Load `/Users/mcasa_atlantis/.codex/.env/codex-services.env`, then connect with `$REDIS_URL`.
The local endpoint is `127.0.0.1:6379`, ACL user `codex`.

Without a host `redis-cli` installation, run it inside the service:

```bash
docker compose --file /Users/mcasa_atlantis/.codex/docker-compose.yaml \
  exec -T redis sh -ec \
  'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli --user "$REDIS_USER" --no-auth-warning'
```

## Operating rules

- Prefix keys with a stable project and capability namespace.
- Set TTLs on caches, leases, locks, and temporary coordination state.
- Use atomic commands, transactions, or Lua scripts for race-sensitive updates.
- Record durable truth in PostgreSQL or another explicit system of record before caching it.
- Inspect key type and TTL before mutating an existing key.
- Never use `FLUSHALL`, `FLUSHDB`, or broad wildcard deletion without explicit authorization.


---
name: data-substrate
description: Use the local Codex-owned data substrate for any task that can benefit from durable or shared state, relational records, SQL, structured metadata, caches, coordination, locks, queues, rate limits, sessions, counters, graph data, relationship traversal, dependency analysis, knowledge graphs, agent memory, indexing, retrieval, checkpoints, cross-turn artifacts, or inter-agent handoff. Trigger proactively whenever an agent needs to store, query, join, cache, coordinate, relate, remember, deduplicate, synchronize, or inspect local data; prefer these already-running PostgreSQL, Redis, and Neo4j services over inventing ad hoc persistence or provisioning another database. Also use to connect to, check, start, or diagnose the local substrate services.
---

# Data Substrate

Use the always-available local substrate owned by `codex-agents`. Route first and read only the
selected backend guide.

## Start here

Load canonical connection variables without printing them:

```bash
set -a
source /Users/mcasa_atlantis/.codex/.env/codex-services.env
set +a
```

Check service health before use:

```bash
docker compose --file /Users/mcasa_atlantis/.codex/docker-compose.yaml ps
```

If a required service is not healthy, start the substrate:

```bash
docker compose --file /Users/mcasa_atlantis/.codex/docker-compose.yaml up -d --wait
```

## Route by data shape

| Need | Backend | Read |
|---|---|---|
| Durable facts, schemas, transactions, joins, structured agent state, audit records | PostgreSQL | [postgresql.md](references/postgresql.md) |
| Fast cache, TTLs, counters, locks, queues, pub/sub, coordination, deduplication | Redis | [redis.md](references/redis.md) |
| Entities plus relationships, dependency traversal, provenance, knowledge graphs | Neo4j | [neo4j.md](references/neo4j.md) |

For a mixed workload, select the system of record first, then read the additional backend guides
needed for derived indexes or coordination. Keep one authoritative owner for each datum.

## Default decisions

- Prefer PostgreSQL as the durable system of record for structured data.
- Prefer Redis for derived, expiring, or coordination state; do not make it the only authority for
  irreplaceable records.
- Prefer Neo4j when relationships and traversal are the primary query shape, not merely because
  records contain foreign keys.
- Reuse the running substrate instead of adding task-local database containers or loose JSON state.
- Namespace tables, keys, labels, and properties by project or capability to avoid collisions.
- Keep writes inside the user's task scope. Broad triggering does not authorize unrelated data
  collection or persistence.

## Safety

- Never print, commit, or copy credential files into reports.
- Never run `docker compose down -v`, delete `./.volume/`, flush Redis, drop databases, or perform
  unbounded destructive queries without explicit user authorization.
- Bind clients to the localhost endpoints from the credential file; do not expose these services
  to other interfaces.
- Inspect existing schemas, keys, labels, and constraints before modifying shared structures.


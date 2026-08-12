---
name: data-substrate
description: Use the local Codex-owned data substrate for durable or shared state, SQL, coordination, sessions, graph traversal, agent memory, retrieval, checkpoints, cross-turn artifacts, inter-agent handoff, and Codex compaction scratchpad hooks. Trigger proactively whenever an agent needs to store, query, join, coordinate, relate, remember, deduplicate, synchronize, inspect local data, or enforce per-session state across manual or automatic compaction. Route private per-session scratch state to localized SQLite, durable process and event truth to PostgreSQL, shared Codex V2 subagent orchestration state only to Redis, and relationship-first traversal to Neo4j. Also use to connect to, check, start, or diagnose the local substrate services.
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
| Private scratch state scoped to the current Codex session | Localized SQLite WAL | Use the session scratchpad below |
| Durable process/event truth, schemas, transactions, joins, audit records, checkpoints, and authoritative metadata | PostgreSQL | [postgresql.md](references/postgresql.md) |
| Shared Codex V2 subagent orchestration state only | Redis | [redis.md](references/redis.md) |
| Entities plus relationships, dependency traversal, provenance, ownership graphs, and knowledge graphs | Neo4j | [neo4j.md](references/neo4j.md) |

For a mixed workload, select the system of record first, then read the additional backend guides
needed for derived indexes or coordination. Keep one authoritative owner for each datum.

## Default decisions

- Prefer localized SQLite for private per-session scratch state.
- Prefer PostgreSQL as the durable system of record for process and event truth.
- Use Redis only for shared Codex V2 subagent orchestration state, never ordinary scratch state, unrelated queues, or general application caching.
- Prefer Neo4j when relationships and traversal are the primary query shape, not merely because records contain foreign keys.
- Reuse the running substrate instead of adding task-local database containers or loose JSON state.
- Namespace tables, keys, labels, and properties by project or capability to avoid collisions.
- Keep writes inside the user's task scope. Broad triggering does not authorize unrelated data collection or persistence.

## Session scratchpad

For substantive work, initialize a localized SQLite WAL database from the active project root:

```bash
"${CODEX_HOME:-$HOME/.codex}/skills/data-substrate/scripts/create-session-scratchpad.sh"
```

The initializer creates `./.agent/sqlite/session-<SESSION_ID>.db`. Use it only for the current
Codex session. Store explicit constraints, verified facts with sources, decisions, open questions,
checkpoints, artifact paths, and important command results. Mark certainty accurately; never store
secrets or credentials. Keep `survive_compaction = 1` for values that must survive compaction.

Global compaction hooks enforce this lifecycle for both `manual` and `auto` triggers:

1. `SessionStart(startup|resume|clear)` initializes the canonical per-session SQLite WAL database.
2. `PreCompact` commits and reads back a durable checkpoint; failure returns `continue: false`.
3. `PostCompact` verifies the matching session, turn, and trigger and closes the event; failure stops
   the continuation because compaction has already occurred.
4. `SessionStart(compact)` verifies the completed lifecycle and injects bounded active rows as
   developer context.

Before changing this lifecycle, read the official Codex Hooks sections for
[`PreCompact`](https://learn.chatgpt.com/docs/hooks#precompact),
[`PostCompact`](https://learn.chatgpt.com/docs/hooks#postcompact), and
[`SessionStart`](https://learn.chatgpt.com/docs/hooks#sessionstart). After changing a hook definition,
use `/hooks` in Codex CLI to review and trust its new hash before relying on it.

Implementation lives under `/Users/mcasa_atlantis/.codex/skills/data-substrate/scripts/`:

- `scratchpad_store.py`: schema, path validation, SQLite pragmas, integrity checks, and lifecycle writes.
- `pre-compact-checkpoint.py`: fail-closed `PreCompact` handler.
- `post-compact-checkpoint.py`: fail-closed `PostCompact` verifier.
- `restore-session-context.py`: `SessionStart` initializer and compact-context restoration.
- `initialize-session-scratchpad.py`: explicit initializer used by `create-session-scratchpad.sh`.

The global hook registration is `/Users/mcasa_atlantis/.codex/hooks.json`. Keep a single handler for
each scratchpad lifecycle stage; matching command hooks run concurrently and must not race over the
same database transition.

## Safety

- Never print, commit, or copy credential files into reports.
- Never run `docker compose down -v`, delete `./.volume/`, flush Redis, drop databases, or perform unbounded destructive queries without explicit authorization.
- Bind clients to localhost endpoints from the credential file; do not expose these services to other interfaces.
- Inspect existing schemas, keys, labels, and constraints before modifying shared structures.

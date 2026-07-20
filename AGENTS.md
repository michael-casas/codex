# Usage semantics
- This file defines the shorthand vocabulary Codex uses in local instruction files.
- Read the JSON map as an alias table: translate abbreviated tokens back to their long-form meaning when interpreting directives.
- Prefer the expanded meaning in explanations and code unless the shorthand is already part of a local file format.

## Global Skills

- Use the global `agent-wiki` skill whenever work touches the shared Obsidian Agent Wiki.
- Agents always have read permission on the Agent Wiki.
- Agents must ask for explicit user approval before creating, editing, moving, renaming, or deleting any Agent Wiki note.
- Use the CLI-first workflow from the skill unless the user explicitly asks for interactive Obsidian usage.

## Global Data Substrate

- Always use the global `data-substrate` skill whenever a task can benefit from durable or shared state, relational data, SQL, caches, coordination, locks, queues, sessions, counters, graph relationships, dependency traversal, knowledge graphs, agent memory, indexing, retrieval, checkpoints, cross-turn artifacts, or inter-agent handoff.
- Proactively consider the substrate whenever an agent needs to store, query, join, cache, coordinate, relate, remember, deduplicate, synchronize, or inspect local data.
- Prefer the existing Codex-owned PostgreSQL, Redis, and Neo4j services over loose persistence files, task-local database containers, or provisioning another database.
- Route by data shape: PostgreSQL for durable structured truth, Redis for expiring or coordination state, and Neo4j for relationship-first traversal.
- Load canonical connection variables from `~/.codex/.env/codex-services.env` without printing, committing, or copying credentials into reports.
- Keep all writes within the user's task scope. Broad skill triggering does not authorize unrelated data collection, persistence, destructive database operations, or deletion of `~/.codex/.volume/`.

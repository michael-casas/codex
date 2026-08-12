# Usage semantics
- This file defines the shorthand vocabulary Codex uses in local instruction files.
- Read the JSON map as an alias table: translate abbreviated tokens back to their long-form meaning when interpreting directives.
- Prefer the expanded meaning in explanations and code unless the shorthand is already part of a local file format.

## Global Skills

- Use the global `agent-wiki` skill whenever work touches the shared Obsidian Agent Wiki.
- Agents always have read permission on the Agent Wiki, including direct read-only filesystem access to every file under `/Users/mcasa_atlantis/Documents/vaults/Agent Wiki/` (also addressable as `~/Documents/vaults/Agent Wiki/`). The `wiki` CLI is optional for reads; it is not a mandatory read path.
- Primary Agent Wiki discovery files are `/Users/mcasa_atlantis/Documents/vaults/Agent Wiki/Agent Wiki Home.md`, `/Users/mcasa_atlantis/Documents/vaults/Agent Wiki/Skills.md`, and `/Users/mcasa_atlantis/Documents/vaults/Agent Wiki/Standards.md`.
- Agents must ask for explicit user approval before creating, editing, moving, renaming, or deleting any Agent Wiki note.
- Do not open or focus Obsidian.app for reads. Use direct filesystem reads or the `wiki` CLI according to task fit. The explicit read-only filesystem permission here supersedes the skill's CLI-only read requirement; the write-approval boundary remains unchanged.

## Global Data Substrate

- Always use the global `data-substrate` skill whenever a task can benefit from durable or shared state, relational data, SQL, coordination, sessions, graph relationships, dependency traversal, agent memory, retrieval, checkpoints, cross-turn artifacts, or inter-agent handoff.
- Proactively consider the substrate whenever an agent needs to store, query, join, cache, coordinate, relate, remember, deduplicate, synchronize, or inspect local data.
- Route by ownership: localized SQLite for private per-session scratch state, PostgreSQL for durable process/event truth and pg-boss delivery, Redis only for shared Codex V2 subagent orchestration state, and Neo4j for relationship-first traversal.
- Do not use the Codex Redis service for ordinary session scratch state, general application caching, unrelated queues, or non-V2 orchestration.
- Load canonical connection variables from `~/.codex/.env/codex-services.env` without printing, committing, or copying credentials into reports.
- Keep all writes within the user's task scope. Broad skill triggering does not authorize unrelated data collection, persistence, destructive database operations, or deletion of `~/.codex/.volume/`.

## Session Scratchpad

- For substantive work, proactively initialize the current session scratchpad from the active project root with `"${CODEX_HOME:-$HOME/.codex}/skills/data-substrate/scripts/create-session-scratchpad.sh"`.
- Use the resulting `./.agent/sqlite/session-<SESSION_ID>.db` only for the current Codex session. The initializer resolves `CODEX_SESSION_ID` or `CODEX_THREAD_ID` and configures SQLite WAL mode.
- Proactively store values that should survive context compaction: explicit user constraints, verified facts with sources, decisions and rationale, open questions, blockers, checkpoints, artifact paths, important command results, and next actions.
- Record whether an entry is verified, reported, inferred, or hypothetical. Never store an unverified guess as a verified fact, and never store secrets or credentials.
- Read and reconcile the scratchpad after compaction, when resuming long-horizon work, before major decisions, and before claiming completion.
- Global lifecycle hooks initialize the per-session SQLite scratchpad at `SessionStart`, checkpoint it at `PreCompact(manual|auto)`, verify the matching event at `PostCompact(manual|auto)`, and restore bounded active context at `SessionStart(compact)`. Compaction hooks fail closed when the canonical scratchpad cannot be verified. Treat this as a safety net, not a substitute for proactive writes during the turn.
- Keep `survive_compaction = 1` for durable session value. Supersede outdated entries instead of silently rewriting history.
- Apply `PRAGMA foreign_keys = ON`, `PRAGMA busy_timeout = 5000`, and `PRAGMA synchronous = FULL` on every SQLite connection; WAL mode itself persists.
- Never commit the session database or its `-wal` and `-shm` files. The scratchpad supports working memory; it does not replace repository documentation, tests, or PostgreSQL process/event truth.

# Portable Agent Wiki CLI

The `wiki` executable provides read-only Agent Wiki retrieval from any cloned
environment. `AGENT_WIKI_HOME` names the vault root directly. Explicit CLI
configuration wins over environment configuration, and mutable SQLite state
never enters the vault or tracked CODEX_HOME source.

## Green Contract

- `WIKI-PATH-001`: `--vault` wins over both Wiki environment variables.
- `WIKI-PATH-002`: `AGENT_WIKI_HOME` wins over legacy `WIKI_VAULT`.
- `WIKI-PATH-003`: the default index belongs to CODEX_HOME runtime state.
- `WIKI-PROCESS-001`: a fresh process can reindex and retrieve from a fixture
  vault using only `AGENT_WIKI_HOME` and `CODEX_HOME`.
- `WIKI-PORTABLE-001`: the public CLI reads a cloned note without modifying it
  and keeps its index outside the vault.

The executable scenario source is [portable-vault.feature](portable-vault.feature).

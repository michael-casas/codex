# Wiki CLI

`wiki-cli` is the CODEX_HOME-native, headless Agent Wiki reader and indexer. It
does not require Obsidian and does not write to the Wiki vault. Its mutable
SQLite search index is stored outside the vault.

## Configure a cloned vault

Set `AGENT_WIKI_HOME` to the absolute root of the Agent Wiki clone on each
machine:

```sh
export AGENT_WIKI_HOME="$HOME/Documents/vaults/Agent Wiki"
```

Resolution precedence is:

1. `wiki --vault PATH`
2. `AGENT_WIKI_HOME`
3. legacy `WIKI_VAULT`
4. `$HOME/Documents/vaults/Agent Wiki`

`WIKI_INDEX_PATH` may override the index location. Otherwise it resolves to
`${CODEX_HOME:-$HOME/.codex}/.runtime/wiki/agent-wiki.sqlite`.

## Build and install

Run all workspace tasks through Nx:

```sh
bun nx run @codex/wiki-cli:build
bun nx run @codex/wiki-cli:test
mkdir -p "$HOME/.local/bin"
ln -sfn "$CODEX_HOME/apps/wiki-cli/bin/wiki.mjs" "$HOME/.local/bin/wiki"
```

Ensure `$HOME/.local/bin` is in `PATH`, then verify the environment-local vault:

```sh
wiki status --json
wiki doctor --json
wiki search "testing" --scope standards --json
```

The launcher executes `apps/wiki-cli/dist/main.js`; rebuild after source
changes. The shared CODEX_HOME shell policy preserves `AGENT_WIKI_HOME` and
legacy `WIKI_*` variables for Codex-spawned commands.

## Nx targets

```sh
bun nx show project @codex/wiki-cli --json
bun nx run @codex/wiki-cli:lint
bun nx run @codex/wiki-cli:typecheck
bun nx run @codex/wiki-cli:build
bun nx run @codex/wiki-cli:test-l1
bun nx run @codex/wiki-cli:test-l2
bun nx run @codex/wiki-cli:test-l3
bun nx run @codex/wiki-cli:test
```

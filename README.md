# Codex Orchestration

This Bun-managed Nx workspace contains the current Codex orchestration
implementation. `codex-workflows` runs trusted local TypeScript workflows
directly, while Codex Control provides the separate durable path through Codex
App Server, PostgreSQL process state, pg-boss delivery, and the control daemon.
The deterministic JSON validation/planning surface remains compatible.

The direct CLI is intentionally process-local. Durable delegation, messaging,
workflow submission, recovery, and Browser visibility enter through the
installed Codex Control plugin and its daemon-backed MCP server.

## Direct TypeScript workflows

The primary source is executable TypeScript whose first line is exactly:

```ts
#!/usr/bin/env -S codex-workflows
```

The CLI owns TypeScript loading internally. Authors do not invoke or name
`tsx`, Bun, esbuild, or generated JavaScript.

```sh
chmod +x apps/codex-workflows/examples/nestjs-resolver-factory-research.workflow.ts
./apps/codex-workflows/examples/nestjs-resolver-factory-research.workflow.ts \
  --input apps/codex-workflows/examples/nestjs-resolver-factory-research.input.json

# Equivalent explicit forms
codex-workflows apps/codex-workflows/examples/nestjs-resolver-factory-research.workflow.ts \
  --input apps/codex-workflows/examples/nestjs-resolver-factory-research.input.json
codex-workflows run apps/codex-workflows/examples/nestjs-resolver-factory-research.workflow.ts \
  --input apps/codex-workflows/examples/nestjs-resolver-factory-research.input.json
```

Running or inspecting a TypeScript workflow imports trusted local code. It has
the same trust boundary as executing that file locally. `--plan` and
`--dry-run` do not call App Server or launch agents, but they still load the
module; do not use them on untrusted source.

The public authoring package exports `defineWorkflow`, `phase`, `parallel`,
`agent`, `artifact`, and `executeWorkflow`. Local runs use bounded concurrency,
pass actual upstream values into downstream prompts, journal redacted node
state before launch, persist bounded artifacts, and drain the process-local
App Server host during success, failure, schema rejection, or cancellation.

Each workflow agent supplies an explicit bounded model identifier and reasoning
effort. Both are forwarded unchanged to Codex App Server, which remains
authoritative for supported combinations; there is no medium-only restriction
or silent substitution. Named Codex configuration profiles remain deferred.

## JSON compatibility

JSON remains accepted for `validate`, `inspect`, `plan`, `dry-run`, and
read-only `.pi` import compatibility. Declarative JSON `run` and run-ID
`resume`, `status`, `events`, `logs`, and `cancel` fail closed with exit 69;
they do not claim cross-process durability.

See [the CLI contract](apps/codex-workflows/CLI.md), [the authoring and schema
contract](packages/workflows/SCHEMA.md), [SPEC.md](SPEC.md), and
[ARCHITECTURE.md](ARCHITECTURE.md).

## Workspace projects

| Project                                | Purpose                                                                                  |
| -------------------------------------- | ---------------------------------------------------------------------------------------- |
| `@codex/workflows`                     | Typed local authoring/runtime plus deterministic JSON validation and planning            |
| `@codex/codex`                         | Version-pinned Codex App Server client and workflow execution adapter                    |
| `@codex/codex-workflows`               | Public interpreter, internal TypeScript loader, local runner, journal, compatibility CLI |
| `@codex/wiki-cli`                      | Headless Agent Wiki retrieval with a portable vault root and Codex-owned SQLite index    |
| `@codex/testing`                       | Layered BATDD policy and aggregate evidence harness                                      |
| `@codex/transport`                     | Local Unix/stdio and authenticated remote WSS App Server hosts                           |
| `@codex/codex-control`                 | Daemon-backed MCP delivery executable                                                    |
| `@codex/codex-control-ui`              | Svelte Browser visibility surface                                                        |
| `@codex/plugin-codex-control`          | Canonical Nx and installable Codex plugin packaging                                      |
| `@codex/daemon` / `@codex/daemon-e2e`  | Production durable-control composition and its boundary tests                            |

Inspect resolved configuration rather than inferring it from filenames:

```sh
bun nx show projects
bun nx show project @codex/workflows --json
bun nx show project @codex/codex --json
bun nx show project @codex/codex-workflows --json
bun nx show project @codex/daemon --json
bun nx show project @codex/plugin-codex-control --json
```

Run workspace tasks through Nx:

```sh
bun nx run @codex/codex-workflows:build
bun nx run @codex/codex-workflows:cli -- --help
bun nx run @codex/workflows:test-l1
bun nx run @codex/codex:test
bun nx run @codex/codex-workflows:test
```

## Portable Agent Wiki CLI

`apps/wiki-cli` is the canonical workspace-owned `wiki` executable. Build it
and link its launcher once after cloning CODEX_HOME:

```sh
bun install --frozen-lockfile
bun nx run @codex/wiki-cli:build
mkdir -p "$HOME/.local/bin"
ln -sfn "$CODEX_HOME/apps/wiki-cli/bin/wiki.mjs" "$HOME/.local/bin/wiki"
```

Point each environment at its independently cloned Agent Wiki vault. The
variable names the vault root itself, not its parent directory:

```sh
export AGENT_WIKI_HOME="$HOME/Documents/vaults/Agent Wiki"
wiki status --json
```

Set that export in the environment that launches Codex Desktop, `codex
app-server`, or the CLI. The shared Codex shell policy admits
`AGENT_WIKI_HOME`, so Codex-spawned commands retain it. Machine-specific paths
remain untracked. `--vault` has highest precedence, followed by
`AGENT_WIKI_HOME`, legacy `WIKI_VAULT`, and the macOS-compatible default.
Unless `WIKI_INDEX_PATH` is set, the writable SQLite index lives at
`${CODEX_HOME:-$HOME/.codex}/.runtime/wiki/agent-wiki.sqlite`, outside the Wiki
clone.

## Governing authority

Cross-project durable doctrine lives in the read-only Agent Wiki note
`codex/orchestration/SPEC.md`. Repository source and tests define the concrete
local runner. Runtime completion and implementation reports are evidence, not
independent verification or acceptance. Read [AGENTS.md](AGENTS.md) and
[TESTING.md](TESTING.md) before changing the workspace.

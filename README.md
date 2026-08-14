# Codex Orchestration

This Bun-managed Nx workspace contains the current Codex orchestration
implementation. Its shipped `codex-workflows` product mode runs trusted local
TypeScript workflows directly while preserving the existing deterministic JSON
validation/planning surface.

Durable cross-process and cross-host orchestration remains a separate future
system governed by the shared Agent Wiki. The local runner is intentionally not
a PostgreSQL process authority, reducer, pg-boss delivery loop, daemon,
monitor, retry authority, or tmux transport.

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
`--dry-run` do not call the SDK or launch agents, but they still load the
module; do not use them on untrusted source.

The public authoring package exports `defineWorkflow`, `phase`, `parallel`,
`agent`, `artifact`, and `executeWorkflow`. Local runs use bounded concurrency,
pass actual upstream values into downstream prompts, journal redacted node
state before launch, persist bounded artifacts, and drain the process-local
Codex SDK host during success, failure, schema rejection, or cancellation.

The current Founder model policy admits any bounded, non-whitespace `gpt-*`
model token with `medium` reasoning. The exact model is forwarded unchanged to
the Codex SDK, which remains authoritative for model availability. No model
substitution is performed.

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
| `@codex/codex`                         | Exclusive `@openai/codex-sdk` adapter and process-local singleton                        |
| `@codex/codex-workflows`               | Public interpreter, internal TypeScript loader, local runner, journal, compatibility CLI |
| `@codex/wiki-cli`                      | Headless Agent Wiki retrieval with a portable vault root and Codex-owned SQLite index    |
| `@codex/testing`                       | Layered BATDD policy and aggregate evidence harness                                      |
| `@codex/daemon` / `@codex/daemon-e2e`  | Existing daemon scaffold and its separate boundary tests; not local-run authority        |

Inspect resolved configuration rather than inferring it from filenames:

```sh
bun nx show projects
bun nx show project @codex/workflows --json
bun nx show project @codex/codex --json
bun nx show project @codex/codex-workflows --json
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

## Herdr-owned ChatGPT Desktop

Run `codex-app-herdr` from a persistent Herdr pane to replace an ordinary
LaunchServices instance with a direct ChatGPT launch that preserves the
pane's complete `HERDR_*` caller context:

```sh
codex-app-herdr --dry-run
codex-app-herdr
codex-app-herdr --status
codex-app-herdr --watch
```

The launcher fails closed outside Herdr, uses a bounded graceful quit, never
sends a kill signal, launches the app executable directly, and reports success
only after both ChatGPT and its bundled Codex app-server expose the inherited
context. `--watch` keeps a guardian in that Herdr pane and reconciles a later
ordinary LaunchServices relaunch. Its audit log is written under
`$CODEX_HOME/log/`; context values are never printed. The tracked shell policy
admits `HERDR_*` into Codex-spawned commands after inheritance has been
established.

macOS may still create a later ordinary LaunchServices instance after login,
an update, or a crash. `codex-app-herdr --status` detects that ownership drift;
run the launcher again from the canonical persistent Herdr pane to reconcile
it. Remote SSH `codex app-server proxy` processes are a separate transport
boundary and require a proxy wrapper that injects a live Herdr context.

Herdr also supports a pane-free guardian through a detached custom command.
Add this machine-local binding to `~/.config/herdr/config.toml`, reload Herdr,
and invoke the binding once from the workspace whose context Codex should own:

```toml
[[keys.command]]
key = "prefix+alt+h"
type = "shell"
command = "exec \"$HOME/.local/bin/codex-app-herdr\" --watch"
description = "Keep ChatGPT and Codex app-server inside Herdr"
```

Detached shell commands expose `HERDR_ACTIVE_*` rather than a pane process's
canonical caller variables. The launcher validates that complete active
context and normalizes it to `HERDR_WORKSPACE_ID`, `HERDR_TAB_ID`, and
`HERDR_PANE_ID` before launching ChatGPT. The guardian then remains owned by
Herdr's persistent background server without occupying a visible pane. It
survives Herdr client detach, but it is not a login item or reboot service: a
full Herdr server stop or host restart ends the guardian, and the binding must
be invoked again after Herdr is available.

## Governing authority

Cross-project durable doctrine lives in the read-only Agent Wiki note
`codex/orchestration/SPEC.md`. Repository source and tests define the concrete
local runner. Runtime completion and implementation reports are evidence, not
independent verification or acceptance. Read [AGENTS.md](AGENTS.md) and
[TESTING.md](TESTING.md) before changing the workspace.

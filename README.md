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
| `workflows`                            | Typed local authoring/runtime plus deterministic JSON validation and planning            |
| `codex`                                | Exclusive `@openai/codex-sdk` adapter and process-local singleton                        |
| `codex-workflows`                      | Public interpreter, internal TypeScript loader, local runner, journal, compatibility CLI |
| `@orchestration/testing`               | Layered BATDD policy and aggregate evidence harness                                      |
| `@orchestration/daemon` / `daemon-e2e` | Existing daemon scaffold and its separate boundary tests; not local-run authority        |

Inspect resolved configuration rather than inferring it from filenames:

```sh
bun nx show projects
bun nx show project workflows --json
bun nx show project codex --json
bun nx show project codex-workflows --json
```

Run workspace tasks through Nx:

```sh
bun nx run codex-workflows:build
bun nx run codex-workflows:cli -- --help
bun nx run workflows:test-l1
bun nx run codex:test
bun nx run codex-workflows:test
```

## Governing authority

Cross-project durable doctrine lives in the read-only Agent Wiki note
`codex/orchestration/SPEC.md`. Repository source and tests define the concrete
local runner. Runtime completion and implementation reports are evidence, not
independent verification or acceptance. Read [AGENTS.md](AGENTS.md) and
[TESTING.md](TESTING.md) before changing the workspace.

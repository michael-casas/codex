# `codex-workflows` CLI

`codex-workflows` is both the interpreter and local runner for trusted
TypeScript workflow source. Build it with:

```sh
bun nx run @codex/codex-workflows:build
```

The package-owned Bun link exposes `codex-workflows` in the normal user PATH.
The declared package bin points to `dist/main.js`; users do not install or name
a TypeScript loader.

## Trusted TypeScript forms

Every admitted source is a readable regular `.ts` file beneath the invocation
working directory after `realpath`, within the source byte limit, and begins
with this exact first line:

```ts
#!/usr/bin/env -S codex-workflows
```

```text
codex-workflows <workflow.ts> [--input <json-file>] [--json]
codex-workflows run <workflow.ts> [--input <json-file>] [--json]
codex-workflows <workflow.ts> --plan|--dry-run [--input <json-file>] [--json]
codex-workflows plan|dry-run <workflow.ts> [--input <json-file>] [--json]
```

Bare and explicit `run` forms are equivalent. An executable source can invoke
the interpreter through its shebang. The CLI bundles/loads TypeScript into an
OS temporary directory, removes that temporary directory after import, and
executes the default `defineWorkflow(...)` export locally.

TypeScript source is trusted executable local code. Importing it may execute
top-level code. `plan` and `dry-run` load the definition and input, but do not
call the SDK, launch agents, create a run journal, or evaluate the dynamic
`run` callback. Their JSON result reports the trusted module-load effect
instead of claiming zero local effects.

`--input` accepts a bounded admitted JSON file. Without it, the workflow input
is `{}`. `--json` emits one machine-readable final document; without it,
progress events are written to stderr and a compact final result to stdout.

Local runs:

- enforce the definition's bounded `maxConcurrency`;
- forward exact requested model, reasoning, schema, command-evidence policy,
  and abort signal through
  the repository-owned Codex SDK facade;
- append actual typed upstream values to the downstream agent input context;
- freeze and journal each node before launch;
- classify failure, schema rejection, and cancellation without raw errors;
- abort queued/running siblings and drain the SDK host;
- store journals under `${CODEX_WORKFLOWS_HOME}/runs/<run-id>` when the bounded
  override is present, otherwise `~/.codex/workflows/runs/<run-id>`; and
- store artifacts under that run's `artifacts/` directory using atomic writes.

The journal is local operational state only. It is not reducer-approved
acceptance, a durable cross-process run record, or a retry authority. Abrupt
process death outside the CLI signal/finalization path can leave a journal at
`running`; there is no invented cross-process reconciler.

## JSON and `.pi` compatibility

```text
codex-workflows validate <source> [--input <json-file>] [--json]
codex-workflows inspect <source> [--json]
codex-workflows plan <source> --input <json-file> [--json]
codex-workflows dry-run <source> --input <json-file> [--json]
codex-workflows import-pi <goal-or-events-path> [--json]
codex-workflows run <source.json> [--input <json-file>] [--json]
codex-workflows resume|status|events|logs|cancel <run-id> [--json]
```

JSON validate/inspect/plan/dry-run remain deterministic and SDK-free.
`import-pi` reads bounded observed goal-v3 or goal-event JSONL as historical
data and never writes `.pi`. JSON `run` and all run-ID control verbs return
`CONTROL_PLANE_UNAVAILABLE` because no accepted cross-process control-plane
protocol is implemented.

## Exit semantics

| Exit | Meaning                                                                                                |
| ---: | ------------------------------------------------------------------------------------------------------ |
|    0 | Command completed successfully.                                                                        |
|   64 | Usage, command, or flag error.                                                                         |
|   65 | Source admission, syntax, definition, input, schema, graph, policy, or legacy-data validation failure. |
|   66 | Required path is unreadable or is not a regular file.                                                  |
|   67 | Local agent failure.                                                                                   |
|   68 | Agent output failed the requested output schema.                                                       |
|   69 | Requested durable/cross-process capability is unavailable.                                             |
|   70 | Redacted internal failure.                                                                             |
|  130 | Local workflow cancellation, including handled SIGINT/SIGTERM.                                         |

Errors expose stable codes and safe details such as the local run ID and
journal path. Prompts, input values, environment values, secrets, stacks, and
raw sensitive errors are not public diagnostics.

## Current model policy

The runner admits any bounded, non-whitespace model token beginning with
`gpt-`, forwards it unchanged with `medium` reasoning, and never substitutes a
different model. The Codex SDK is authoritative for actual model availability.

Tested examples:

- `examples/nestjs-resolver-factory-research.workflow.ts`
- `examples/nestjs-resolver-factory-research.input.json`
- `examples/canonical-review.workflow.json`
- `examples/canonical-review.input.json`

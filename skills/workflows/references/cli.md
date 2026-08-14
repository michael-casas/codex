# CLI and exits

Canonical repository documentation:

- `$CODEX_HOME/apps/codex-workflows/CLI.md`
- `$CODEX_HOME/SPEC.md`
- implementation: `$CODEX_HOME/apps/codex-workflows/src/cli/cli.ts`

Build from `${CODEX_HOME:-$HOME/.codex}`:

```sh
bun nx run @codex/codex-workflows:build
codex-workflows --help
```

## Trusted TypeScript

The first line must be exact:

```ts
#!/usr/bin/env -S codex-workflows
```

```text
./workflow.ts [--input <json-file>] [--json]
codex-workflows <workflow.ts> [--input <json-file>] [--json]
codex-workflows run <workflow.ts> [--input <json-file>] [--json]
codex-workflows <workflow.ts> --plan|--dry-run [--input <json-file>] [--json]
```

The CLI loads TypeScript internally. A source must be a bounded readable
root-contained regular `.ts` file with the exact shebang and a default
`defineWorkflow(...)` export. Loading it executes trusted local module code.
Plan/dry-run load metadata but execute no workflow callback, SDK turn, or
agent.

Runs use bounded concurrency and local atomic state at
`${CODEX_WORKFLOWS_HOME:-~/.codex/workflows}/runs/<run-id>`. The journal and
artifacts are process-local operational state. Abrupt process death can leave
`running`; do not claim recovery or cross-process durability.

## JSON compatibility and durable boundary

```text
codex-workflows validate <source> [--input <json-file>] [--json]
codex-workflows inspect <source> [--json]
codex-workflows plan <source> --input <json-file> [--json]
codex-workflows dry-run <source> --input <json-file> [--json]
codex-workflows import-pi <goal-or-events-path> [--json]
codex-workflows run <source.json> [--input <json-file>] [--json]
codex-workflows resume|status|events|logs|cancel <run-id> [--json]
```

JSON validate/inspect/plan/dry-run are SDK-free. `.pi` import is read-only.
JSON run and all run-ID controls fail with exit 69 because the distinct durable
control plane is not implemented.

## Output and exits

`--json` writes one final JSON document; errors go to stderr. Human runs write
progress to stderr and a compact final result to stdout.

| Exit | Meaning                                      |
| ---: | -------------------------------------------- |
|    0 | Success                                      |
|   64 | Usage                                        |
|   65 | Source admission or validation               |
|   66 | Path I/O or non-regular file                 |
|   67 | Agent failure                                |
|   68 | Output-schema failure                        |
|   69 | Durable/cross-process capability unavailable |
|   70 | Redacted internal failure                    |
|  130 | Cancellation                                 |

Public events/journals contain stable identities, timings, requested
model/reasoning, outcomes, and digests. They omit raw prompts, inputs,
environment values, secrets, stacks, and sensitive errors.

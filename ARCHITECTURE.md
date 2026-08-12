# Codex Workflows direct runner architecture

## System shape

```text
trusted workflow.ts + admitted JSON input
                |
                v
     codex-workflows interpreter
       | source admission + internal esbuild load in OS temp
       | default defineWorkflow(...) export
       v
  @orchestration/workflows runtime
       | phase / parallel / bounded scheduler / typed value dataflow
       | frozen digest-only events
       +--------------------+
       |                    |
       v                    v
@orchestration/codex   local operational journal
 exclusive SDK adapter  atomic journal + artifacts
       |
       v
 live or controlled Codex backend
```

The graph is process-local. It has no database, delivery queue, reducer,
daemon, monitor, or tmux authority.

## Project ownership

`packages/workflows` owns the TypeScript definition marker, authoring helpers,
bounded scheduler, lineage/dataflow, output-schema enforcement, public event
contract, and the preserved JSON compiler/planner. It imports no Codex SDK.

`packages/codex` owns the sole production `@openai/codex-sdk` import, SDK
option mapping, process-local singleton admission, lifecycle tokens,
cancellation, streamed response normalization, and safe observations.

`apps/codex-workflows` owns argv parsing, source/input admission, the internal
TypeScript loader, local execution composition, exit mapping, human/JSON
projection, progress output, journal/artifact persistence, and JSON/`.pi`
compatibility.

The app has explicit workspace edges to both public packages. The app build
externalizes `@orchestration/codex` so the SDK retains its own `import.meta.url`
and resolves its pinned Codex executable correctly. `codex:build` emits that
runtime package before the app build. The TypeScript authoring package is
bundled into workflow modules with a global symbol bridge so the internally
loaded source and runner share one runtime identity.

## Execution sequence

1. The CLI resolves the source and input through bounded root-contained
   `realpath` admission.
2. The loader checks `.ts`, UTF-8, and exact shebang.
3. esbuild bundles the trusted source to an OS temporary ESM module, aliasing
   `@orchestration/workflows` to the package entry.
4. The CLI imports the module, validates the default marked definition, and
   removes the temporary directory.
5. Inspection stops here with zero SDK/agent launches. Module top-level code
   has still executed at this trusted boundary.
6. Run creates a stable local run ID and atomic initial journal.
7. The app initializes the process-local Codex host.
8. `executeWorkflow` validates input and installs the runtime bridge.
9. Each `agent` freezes identity, phase, dependencies, requested model and
   reasoning, prompt/input/schema digests, and time; the journal persists that
   event before scheduler launch.
10. The scheduler starts ready work up to `maxConcurrency`. `parallel` retains
    record/array shape.
11. The private SDK request contains the author prompt plus actual serialized
    typed input. Public state contains only digests.
12. Response JSON is schema-checked when requested; output values and digest
    lineage become available to downstream TypeScript.
13. Artifacts are atomically persisted under the run directory.
14. The journal receives terminal events/status. The SDK host drains and
    releases in `finally`.

## Failure and cancellation

The first agent or output-schema failure becomes the workflow failure,
aborts the shared scheduler controller, signals active operations, rejects
queued operations, and prevents later artifact creation. SDK children are
reaped before host shutdown completes. SIGINT/SIGTERM abort the same controller
and map to exit 130. Public diagnostics contain classifications, run ID, and
journal path—not raw backend errors.

An uncatchable process death can interrupt atomic finalization and leave the
last complete journal at `running`. The local mode does not invent a
cross-process recovery authority to rewrite it.

## Journal structure and limits

The default root is `~/.codex/workflows`; an explicit
`CODEX_WORKFLOWS_HOME` is useful for isolated tests. Every run is constrained
to its validated run-ID directory. The journal bounds nodes/events; artifacts
have safe basenames and per-file byte limits. Both journal and artifact files
use write-then-rename replacement with private modes.

Node projections record freeze, start, and terminal timing, terminal outcome,
duration, model/reasoning, dependencies, safe diagnostics, and content
digests. Prompts, inputs, environment values, secrets, stacks, and raw errors
are recursively redacted if presented to the journal adapter.

## Trusted code and inspection

The source admission checks prevent path escape and accidental loader
mismatch; they do not sandbox authored TypeScript. Source import is local code
execution. This applies to `run`, `validate`, `inspect`, `plan`, and `dry-run`
when the subject is TypeScript. Inspection guarantees only that the workflow
callback and agents are not launched.

## Model boundary

The current Founder policy admits any bounded, non-whitespace `gpt-*` model
token with `medium` reasoning. The workflow runtime forwards the requested
model verbatim and maintains no model-name allowlist or fallback map. The SDK
remains authoritative for whether the requested model exists.

## Durable orchestration separation

Future durable orchestration may lower normalized definitions into the Agent
Wiki-governed PostgreSQL/reducer/pg-boss/monitor/tmux system. This repository
candidate does not implement that edge. JSON run and run-ID control verbs
therefore fail closed with `CONTROL_PLANE_UNAVAILABLE`; local TypeScript run
IDs are explicitly not accepted durable run identities.

## Installed executable

`apps/codex-workflows/package.json` declares
`"codex-workflows": "./dist/main.js"`. The repository-supported Bun link
places the executable in the user's existing Bun PATH, so `/usr/bin/env -S
codex-workflows` resolves without shell configuration changes.

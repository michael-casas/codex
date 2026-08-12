# Codex Workflows direct TypeScript runner specification

**Status:** Founder-amended implementation candidate  
**Additive Green Contracts:** `CDX-WF-GC-2`, `CDX-WF-GPT-GC-1`  
**Founder model override:** any bounded, non-whitespace `gpt-*` model token,
forwarded unchanged with `medium` reasoning

This specification is additive to the preserved JSON workflow contract. Where
the earlier candidate described JSON as the only source and returned exit 69
for every `run`, this Founder settlement controls: trusted TypeScript is the
primary executable source and runs locally.

## 1. Product outcome

An author writes one trusted executable TypeScript file beginning exactly:

```ts
#!/usr/bin/env -S codex-workflows
```

The `codex-workflows` executable is both interpreter and runner. These forms
are equivalent:

```sh
./workflow.ts
codex-workflows workflow.ts
codex-workflows run workflow.ts
```

The CLI owns TypeScript loading internally. No authored JavaScript build,
JSON compilation artifact, `tsx`, Bun, or other loader is a prerequisite.

## 2. Scope and authority

The shipped local mode owns one process-local execution, bounded scheduling,
progress events, a bounded operational journal, artifacts, and guaranteed SDK
host drain. It is an accepted product mode, not a fallback durable control
plane.

It does not own or claim:

- PostgreSQL process/event truth or reducer transitions;
- pg-boss delivery, leases, retries, or recovery;
- a daemon, cross-process resume/status/event/log/cancel service, or monitor;
- tmux transport or durable worktree orchestration;
- verification, judgment, or acceptance authority.

The local journal is operational state. Runtime completion is not reducer
acceptance.

## 3. Public authoring API

`@orchestration/workflows` exports at minimum:

```ts
defineWorkflow<Input, Output>(options): WorkflowDefinition<Input, Output>
phase<Value>(name, callback): Promise<Value>
parallel(recordOrArray): Promise<same-shaped-results>
agent<Output, Input>(options): Promise<Output>
artifact<Value>(name, valueOrOptions): Promise<WorkflowArtifact>
executeWorkflow(definition, input, adapters): Promise<WorkflowExecutionResult>
```

Ordinary TypeScript variables carry typed values. `parallel` starts ready
sibling thunks concurrently while preserving record/array shape. `agent`
requires explicit label, model, reasoning, and prompt; accepts typed input and
an optional output schema. Downstream turns contain actual serialized upstream
results. `phase` groups progress only.

`defineWorkflow` validates and freezes stable metadata. `executeWorkflow`
installs the runtime only for the current process execution and fails closed on
nested/ambient runtime conflict.

## 4. Scheduling, dataflow, and outcomes

- Maximum concurrency is defined per workflow, defaults to four, and is
  bounded from one through 64.
- Every node receives a stable workflow/ordinal/label identity.
- A node is frozen and journaled before its SDK operation starts.
- Frozen state includes dependencies, requested model/reasoning, prompt and
  input digests, optional output-schema digest, and time.
- Actual agent input is appended to the private prompt sent through the SDK;
  dependencies are derived additionally from digest lineage.
- Output schemas are enforced after response parsing and before downstream
  dataflow.
- First failure aborts active siblings, rejects queued siblings, prevents new
  artifact writes, and drains all scheduled work.
- External cancellation follows the same path and maps to exit 130.
- SDK host shutdown runs in `finally` after success or every terminal failure.

## 5. Public-state confidentiality

Public events and journals carry prompt/input/output digests, never raw prompt
or input values. Environment values, secrets, raw errors, and stacks are
redacted/omitted. Diagnostics classify failures as agent, schema, or
cancellation and may safely disclose the local run ID and journal path.

Artifacts deliberately persist declared values under the private local run
directory. Their metadata—not content—enters public events.

## 6. Source admission and trusted-code boundary

The source loader requires:

- a readable regular file after `realpath`;
- containment beneath the current invocation root;
- `.ts` extension and bounded bytes;
- valid UTF-8;
- the exact shebang as the first line; and
- a default export produced by `defineWorkflow(...)`.

The internal loader bundles into an OS temporary directory, imports the module,
and removes the temporary directory. This is source loading, not a security
sandbox. Running or inspecting the source is equivalent to executing trusted
local code. `plan`/`dry-run` import the module but do not execute the workflow
callback or initialize the SDK.

## 7. CLI contract

```text
codex-workflows <workflow.ts> [--input <json-file>] [--json]
codex-workflows run <workflow.ts> [--input <json-file>] [--json]
codex-workflows <workflow.ts> --plan|--dry-run [--input <json-file>] [--json]
codex-workflows validate|inspect|plan|dry-run <json-or-ts-source> ...
codex-workflows import-pi <goal-or-events-path> [--json]
codex-workflows resume|status|events|logs|cancel <run-id> [--json]
```

Bare TypeScript and `run <workflow.ts>` execute locally. TypeScript plan and
dry-run expose definition metadata, explicitly report dynamic graph discovery,
and launch zero agents. JSON validate/inspect/plan/dry-run retain prior
behavior. JSON run and all run-ID durable verbs fail closed with exit 69.

Exit meanings are deterministic:

| Exit | Meaning                                      |
| ---: | -------------------------------------------- |
|    0 | Success                                      |
|   64 | Usage                                        |
|   65 | Source admission or validation               |
|   66 | Path I/O / non-regular source                |
|   67 | Agent failure                                |
|   68 | Output-schema failure                        |
|   69 | Unavailable durable/cross-process capability |
|   70 | Redacted internal failure                    |
|  130 | Cancellation                                 |

## 8. Local journal and artifacts

Default root: `~/.codex/workflows`; bounded override:
`CODEX_WORKFLOWS_HOME`. Each stable `local-<timestamp>-<entropy>` run ID owns:

```text
runs/<run-id>/journal.json
runs/<run-id>/artifacts/<safe-name>
```

Journal and artifact replacement is atomic. Per-run event, node, artifact-byte,
name, source, and input limits are enforced. Journal state has explicit
`local-operational-journal` authority and terminal status when the normal or
signal-handled finalizer runs. Abrupt process death can leave `running`; no
cross-process reconciler is claimed.

## 9. Codex SDK boundary

Only `packages/codex/src/runtime/adapter.ts` may import
`@openai/codex-sdk`. The app consumes the package-owned facade. Model,
reasoning, output schema, cancellation, working directory, approval, sandbox,
network, and web-search requests are forwarded through owned types. The host is
a process-local singleton and lifecycle barrier only.

## 10. Founder `gpt-*` pass-through override

Every bounded, non-whitespace model token beginning with `gpt-` is admitted
with `medium` reasoning and forwarded byte-for-byte to the Codex SDK. The
workflow runtime does not enumerate model names, infer availability, or
substitute a fallback. The SDK remains authoritative for whether an admitted
model exists.

The earlier Luna-only override and its contract hashes remain historical
evidence. They are superseded by `CDX-WF-GPT-GC-1`, not relabelled as proof of
the new policy.

## 11. Compatibility

JSON remains a normalized plan/journal compatibility format and optional
inspection source. It is not a mandatory authoring or pre-run compilation
step. Existing normalize, validate, inspect, plan, dry-run, and read-only `.pi`
import behavior remains locked unless explicitly superseded.

## 12. Acceptance boundary

The additive executable contract is
`packages/testing/evidence/codex-workflows-ts-runner-green-contract.json`.
Implementation tests and reports are worker evidence only. The final handoff
may say `READY_FOR_EXTERNAL_AUDIT` after all required proof exists; it may not
claim independent Preflight, verification, judgment, score, or acceptance.

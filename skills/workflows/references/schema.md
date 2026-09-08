# Authoring, schema, and APIs

Canonical contracts:

- `$CODEX_HOME/packages/workflows/SCHEMA.md`
- `$CODEX_HOME/SPEC.md`
- `$CODEX_HOME/packages/workflows/src/index.ts`
- `$CODEX_HOME/packages/codex/src/index.ts`

## Primary TypeScript API

For the installed Codex Control desktop path, submit trusted `.workflow.ts`
using `run_workflow({source, input, idempotencyKey, hostId?})`; do not calculate a
source digest, compile JavaScript manually, or register individual modules.
The daemon requires pre-authorized actor/repository/assignment context and
executes agents through App Server. This does not change the direct CLI's
separate process-local lifecycle or make it equivalent to desktop dogfood.

`@codex/workflows` exports:

```ts
defineWorkflow<Input, Output>(options);
phase(name, callback);
parallel(recordOrArray);
agent<Output, Input>({ label, model, reasoning, prompt, input, outputSchema? });
artifact(name, valueOrOptions);
executeWorkflow(definition, input, adapters);
```

Use ordinary typed variables for dataflow. Wrap ready sibling thunks in
`parallel` to preserve record/array shape and concurrency. Supply actual prior
results as downstream `input`; dependency digests are observability metadata,
not a substitute for values. `phase` groups progress only.

`agent` requires explicit model and reasoning. It admits bounded safe identifiers,
forwards both unchanged to Codex App Server, and never falls back silently.
The provider decides model availability and supported effort combinations.
Named configuration profiles remain separate from these explicit settings.
An output schema causes JSON
parse plus strict schema validation and maps failure to exit 68.

Security work retains its separate role-routing requirement regardless of
available reasoning levels. Security audit and security fix/remediation assignments each require
exactly `gpt-5.5` with `high` reasoning and separate identities. Dispatch them
outside `agent()` through the authorized dedicated execution path. Reject the
workflow at review time if it attempts to disguise security work as a general
audit, safety, compliance, vulnerability, authorization, secret-handling, or
security-remediation node. Do not downgrade or substitute the locked seat.

Every node is frozen before launch with stable ID, dependencies,
model/reasoning, prompt/input/schema digests, and timing. Public events and
journals remain digest-only for sensitive values. `artifact` stores declared
content under the local run and returns exact path/digest/media type.

## JSON compatibility API

The package retains:

```ts
canonicalizeJson(value);
sha256(value);
normalizeWorkflow(source);
validateWorkflowInput(workflow, input);
planWorkflow(workflow, input);
parseLegacyPi(bytes);
```

JSON schema version 1 supports task, fan-out, join, subworkflow, and artifact
steps plus bounded policy requests. Validation rejects malformed schema,
unsafe pointers/roots, invalid dependencies/cycles, and excessive bounds.
Planning is deterministic and performs no SDK call/write. JSON is optional
compatibility input, never a mandatory compiled artifact for TypeScript.

## SDK ownership

Only
`$CODEX_HOME/packages/codex/src/runtime/adapter.ts`
may import `@openai/codex-sdk`. The app uses owned facade types and guarantees
host drain in `finally`. The singleton is process-local lifecycle hygiene, not
durable scheduling.

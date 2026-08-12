# Authoring, schema, and APIs

Canonical contracts:

- `$CODEX_HOME/packages/workflows/SCHEMA.md`
- `$CODEX_HOME/SPEC.md`
- `$CODEX_HOME/packages/workflows/src/index.ts`
- `$CODEX_HOME/packages/codex/src/index.ts`

## Primary TypeScript API

`@orchestration/workflows` exports:

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

`agent` requires explicit model and reasoning. It admits any bounded,
non-whitespace `gpt-*` model token with `medium`, forwards the exact token to
the Codex SDK, and never falls back silently. An output schema causes JSON
parse plus strict schema validation and maps failure to exit 68.

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

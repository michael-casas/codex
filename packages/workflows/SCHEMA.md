# Workflow authoring and compatibility contracts

`@orchestration/workflows` owns two public surfaces: the primary trusted
TypeScript authoring/runtime API and the retained deterministic JSON
normalization/planning API.

## Direct TypeScript API

```ts
#!/usr/bin/env -S codex-workflows
import { agent, artifact, defineWorkflow, parallel, phase } from '@orchestration/workflows';

export default defineWorkflow<Input, Output>({
  id: 'example',
  version: 1,
  maxConcurrency: 2,
  inputSchema: {
    /* strict JSON Schema 2020-12 */
  },
  async run(input) {
    const research = await phase('Research', () =>
      parallel({
        first: () =>
          agent<string, Input>({
            label: 'first',
            model: 'gpt-5.6-luna',
            reasoning: 'medium',
            prompt: 'Research one bounded question.',
            input,
          }),
        second: () =>
          agent<string, Input>({
            label: 'second',
            model: 'gpt-5.6-luna',
            reasoning: 'medium',
            prompt: 'Research the sibling question.',
            input,
          }),
      }),
    );

    const decision = await agent<{ proposal: string }, typeof research>({
      label: 'consolidate',
      model: 'gpt-5.6-luna',
      reasoning: 'medium',
      prompt: 'Consolidate the supplied research.',
      input: research,
      outputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['proposal'],
        properties: { proposal: { type: 'string', minLength: 1 } },
      },
    });

    const saved = await artifact('proposal.md', {
      value: decision.proposal,
      mediaType: 'text/markdown',
    });
    return { proposal: decision.proposal, artifact: saved };
  },
});
```

`defineWorkflow<Input, Output>` freezes validated definition metadata. IDs are
stable lowercase-compatible strings; versions are positive integers; and
`maxConcurrency` is an integer from 1 through 64.

`phase(name, callback)` emits progress grouping only. It does not authorize
execution, persistence, retries, or acceptance.

`parallel(recordOrArray)` starts every supplied ready thunk/promise and
preserves the exact record or tuple/array result shape. The local scheduler
enforces the workflow concurrency bound.

`agent<Output, Input>(options)` requires explicit `label`, `model`, `reasoning`,
and `prompt`; accepts typed `input`, optional strict JSON `outputSchema`, and an
optional `commandEvidence` policy. A command-evidence policy declares bounded
stable rule IDs, private command substrings, and exact expected occurrence
counts. The local host evaluates completed SDK command items, fails the node if
any count differs, and retains only policy/command digests plus rule counts—not
raw commands or command output.
`WorkflowModel` is a `gpt-${string}` token. Runtime admission requires a
bounded, non-whitespace `gpt-` value and forwards it unchanged; the Codex SDK
decides whether the model exists. The current workflow reasoning boundary is
`medium`. No fallback or model-name allowlist exists.

Actual upstream outputs are serialized into the downstream turn context. Node
dependency identities are additionally derived from output/input digests;
edges never replace the values.

`artifact(name, valueOrOptions)` writes a safe basename beneath the local
run's artifact directory. Strings retain their bytes; other values are written
as bounded JSON. The result includes name, exact path, SHA-256 digest, and
media type.

`executeWorkflow` is the public process-local runtime seam used by the CLI and
deterministic tests. It accepts injected agent/artifact/event adapters,
supports an abort signal, and returns typed output, terminal nodes, and
artifacts. Runtime helpers fail closed outside an active execution.

## Public events and journal projection

Every agent emits a frozen node record before launch containing stable ID,
ordinal, label, phase, dependencies, model, reasoning, prompt/input/output
schema digests, optional command-evidence-policy digest, and freeze time. Start
and terminal events add timing, duration, terminal outcome, output digest,
optional digest-bound command evidence, and a classified diagnostic.

Public events and journals omit raw prompt, input, environment, secret, stack,
and error values by default. Artifact content is intentionally written to its
declared private run path; only artifact metadata enters events.

## Trusted source admission

The interpreter admits only a regular root-contained `.ts` file with the exact
first line `#!/usr/bin/env -S codex-workflows`. It compiles internally in an OS
temporary directory and requires a default `defineWorkflow(...)` export.
Loading the module is equivalent to executing trusted local code, including
during plan/dry-run inspection. Inspection does not execute `run` or launch an
agent.

## JSON compatibility source

The retained JSON envelope uses `schemaVersion: 1`, stable ID/version, strict
input/output JSON Schema, bounded policy, and explicit `task`, `fan-out`,
`join`, `subworkflow`, or `artifact` steps. Codex handlers declare prompts and
optional models; JSON planning hashes prompts rather than exposing them.

The compatibility package exports:

```ts
canonicalizeJson(value);
sha256(value);
normalizeWorkflow(source);
validateWorkflowInput(workflow, input);
planWorkflow(workflow, input);
parseLegacyPi(bytes);
```

Normalization rejects malformed envelopes, unknown fields/handlers, unsafe
pointers/roots, invalid or remote schemas, duplicate/missing/self dependencies,
cycles, and invalid conditional topology. Planning is deterministic, expands
bounded fan-out, records explicit joins/skips, and performs no SDK call or
write.

JSON is not a required author-authored compilation artifact for TypeScript
execution. JSON `run` remains unavailable until the distinct durable control
plane exists.

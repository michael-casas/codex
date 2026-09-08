# Workflow authoring and compatibility contracts

`@codex/workflows` owns two public surfaces: the primary trusted
TypeScript authoring/runtime API and the retained deterministic JSON
normalization/planning API.

## Direct TypeScript API

```ts
#!/usr/bin/env -S codex-workflows
import { agent, artifact, defineWorkflow, parallel, phase } from '@codex/workflows';

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
and `prompt`; accepts typed `input`, optional strict JSON `outputSchema`,
optional boolean `networkAccess`, and an optional `commandEvidence` policy.
Omitting `networkAccess` enables network access for CAS agent execution;
explicit `networkAccess: false` remains a per-agent opt-out. The effective
boolean is frozen and journaled with the node. It does not alter read-only or
writable-root filesystem policy, approval policy, authentication, TLS, or
secret handling. A command-evidence policy declares bounded
stable rule IDs, private command substrings, and exact expected occurrence
counts. The local host evaluates completed SDK command items, fails the node if
any count differs, and retains only policy/command digests plus rule counts—not
raw commands or command output.

As an explicit alternative to `model` and `reasoning`, an agent may adopt one
existing thread with `existingThread: { hostId, threadId, activeTurn }`.
`activeTurn` is either `{ behavior: 'reject' }` or
`{ behavior: 'steer', expectedTurnId }`. Runtime overrides, including
networkAccess, are forbidden on adopted nodes so the thread keeps its current
settings. A workflow may claim a host/thread pair only once; duplicate claims
fail before a second execution. Adoption never authorizes cleanup of the
external workspace or App Server process.
`WorkflowModel` and `WorkflowReasoning` are explicit per-agent strings.
Models are safe identifiers of 1–254 characters; reasoning is a lowercase
identifier of 1–64 characters. Runtime admission rejects malformed inputs,
then forwards both values unchanged to Codex App Server. Provider availability
and supported model/effort combinations remain provider authority: there is
no local model matrix, medium-only restriction, or silent fallback.
Each frozen node and durable command preserves its exact chosen profile.
The task-level `run_workflow` tool requires `reasoningEffort` explicitly.
Named Codex configuration profiles are a separate unresolved capability in the
pinned App Server version, not an alias for these explicit settings.

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
ordinal, label, phase, dependencies, model, reasoning, effective network access,
prompt/input/output
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

# Trusted workflow-file submission

Codex Control also accepts the source form of `run_workflow`:

```json
{
  "source": ".agent/artifacts/demo.workflow.ts",
  "input": { "topics": ["design", "copy"] },
  "idempotencyKey": "demo-request-1"
}
```

`hostId` is optional when exactly one actor-bound context is admitted. Missing or
ambiguous context fails before source access; it is not inferred from global
credentials. A new intentional run needs a new idempotency key. Existing registered
workflow calls retain their full explicit envelope and behavior.

The daemon's trusted startup `workflowSources` configuration binds actorAgentId,
hostId, repositoryId, assignmentId, baseRevision, sourceRoot and runtimeProfile.
Bind actorAgentId to the daemon-authenticated principal (currently `codex-control`
for the default loopback server), not a self-asserted client identity. Multiple
matching contexts fail explicitly; a caller cannot expand its authority by
changing a request body or a plugin environment variable.
The repository/host must already be admitted. `sourceRoot` is the local authoring
root, independent of the selected execution host's checkoutPath. Profiles retain
explicit model, reasoningEffort, sandbox and approvalPolicy values. Per-node
model/reasoning remains unchanged. Empty `workflows: []` is valid when at least
one source context exists; individual workflow modules need not be registered.

Source files must end in `.workflow.ts`. Static relative imports are bundled,
with at most 128 input files, 1 MiB per file and 8 MiB aggregate/output. Imports
must remain inside the approved source root or the owned authoring library.
Node builtins remain available because this is trusted code execution, NOT a
sandbox. Nonliteral dynamic imports/requires and unbound external packages are
rejected, rather than omitted from executable identity.

The server-only `@codex/workflows/source` subpath owns compilation and compiled
source loading. The root authoring facade does not import esbuild. Executable
identity covers bundled bytes plus compiler version and source/dependency hashes.
Artifacts are stored under the authoring root's `.agent/workflow-modules/` with
content-addressed names and verified again when resolved, including after daemon
restart. These admitted source artifacts are retained for recovery; deleting them
while runs remain recoverable is not supported.

Compiler and source-admission errors expose stable codes, not file contents.
The `source.*` reference namespace is internal; callers must use source admission
rather than forge a registered reference. Successful submission returns the same
durable handle and Browser URL contract as registered workflows. Compiling source
does not prove that a desktop plugin or daemon is configured and running.

import { describe, expect, test } from 'vitest';

import * as publicApi from '../index.js';

type JsonSchema = Record<string, unknown>;

interface AgentOptions<Input = unknown> {
  label: string;
  model: string;
  reasoning: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  prompt: string;
  input?: Input;
  outputSchema?: JsonSchema;
  commandEvidence?: {
    rules: Array<{
      id: string;
      includes: string;
      expectedCount: number;
    }>;
  };
}

interface WorkflowDefinition<Input, Output> {
  id: string;
  version: number;
  maxConcurrency: number;
  run(input: Input): Promise<Output> | Output;
}

interface ArtifactResult {
  name: string;
  path: string;
  publishedPath?: string;
  digest: `sha256:${string}`;
  mediaType: string;
}

interface WorkflowEvent {
  sequence: number;
  type: string;
  node?: {
    id: string;
    label: string;
    dependencies: string[];
    model: string;
    reasoning: string;
    promptDigest: string;
    inputDigest: string;
  };
  outcome?: string;
}

interface AgentExecutionRequest extends AgentOptions {
  signal: AbortSignal;
}

interface AuthoringApi {
  defineWorkflow<Input, Output>(options: {
    id: string;
    version?: number;
    description?: string;
    maxConcurrency?: number;
    inputSchema?: JsonSchema;
    run(input: Input): Promise<Output> | Output;
  }): WorkflowDefinition<Input, Output>;
  phase<Value>(
    name: string,
    callback: () => Promise<Value> | Value,
  ): Promise<Value>;
  parallel<Value>(values: Value): Promise<unknown>;
  agent<Output = string, Input = unknown>(
    options: AgentOptions<Input>,
  ): Promise<Output>;
  artifact(name: string, valueOrOptions: unknown): Promise<ArtifactResult>;
  executeWorkflow<Input, Output>(
    definition: WorkflowDefinition<Input, Output>,
    input: Input,
    options: {
      runId: string;
      signal?: AbortSignal;
      executeAgent(request: AgentExecutionRequest): Promise<{
        threadId: string;
        finalResponse: string;
        usage: null;
        commandEvidence?: {
          schemaVersion: 1;
          policyDigest: `sha256:${string}`;
          totalCompletedCommands: number;
          commandDigests: readonly `sha256:${string}`[];
          rules: readonly {
            id: string;
            expectedCount: number;
            observedCount: number;
            passed: boolean;
          }[];
          digest: `sha256:${string}`;
        };
      }>;
      writeArtifact(request: {
        name: string;
        value: unknown;
        mediaType?: string;
        publishPath?: string;
      }): Promise<ArtifactResult>;
      onEvent(event: WorkflowEvent): void | Promise<void>;
    },
  ): Promise<{
    status: 'completed';
    output: Output;
    nodes: ReadonlyArray<{
      id: string;
      label: string;
      dependencies: readonly string[];
      model: string;
      reasoning: string;
      outcome: string;
    }>;
    artifacts: readonly ArtifactResult[];
  }>;
}

function api(): AuthoringApi {
  const candidate = publicApi as unknown as Record<string, unknown>;
  expect(candidate).toEqual(
    expect.objectContaining({
      defineWorkflow: expect.any(Function),
      phase: expect.any(Function),
      parallel: expect.any(Function),
      agent: expect.any(Function),
      artifact: expect.any(Function),
      executeWorkflow: expect.any(Function),
    }),
  );
  return candidate as unknown as AuthoringApi;
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

// === L1: UNIT TESTS ===

describe('[L1:UNIT] direct TypeScript workflow authoring API', () => {
  test('[L1:UNIT] TS-GC2-001 exports and freezes the ergonomic typed authoring surface', async () => {
    const runtime = api();
    const definition = runtime.defineWorkflow<{ topic: string }, string>({
      id: 'typed-authoring',
      maxConcurrency: 3,
      inputSchema: {
        type: 'object',
        required: ['topic'],
        properties: { topic: { type: 'string' } },
      },
      run: async (input) => input.topic,
    });

    expect(definition).toEqual(
      expect.objectContaining({
        id: 'typed-authoring',
        version: 1,
        maxConcurrency: 3,
        run: expect.any(Function),
      }),
    );
    expect(Object.isFrozen(definition)).toBe(true);
    await expect(runtime.phase('outside', () => 'value')).rejects.toThrow(
      'WORKFLOW_RUNTIME_UNAVAILABLE',
    );
    await expect(
      runtime.agent({
        label: 'outside',
        model: 'gpt-5.6-luna',
        reasoning: 'medium',
        prompt: 'must not run',
      }),
    ).rejects.toThrow('WORKFLOW_RUNTIME_UNAVAILABLE');
    await expect(runtime.artifact('outside.txt', 'value')).rejects.toThrow(
      'WORKFLOW_RUNTIME_UNAVAILABLE',
    );
  });

  test('[L1:UNIT] TS-GC2-002 launches thunk and promise siblings concurrently while preserving record and array shape', async () => {
    const runtime = api();
    const gate = deferred();
    const started: string[] = [];
    const task = (label: string) => async () => {
      started.push(label);
      await gate.promise;
      return `${label}-result`;
    };

    const recordPromise = runtime.parallel({
      cqrs: task('cqrs'),
      graphql: task('graphql'),
    }) as Promise<{ cqrs: string; graphql: string }>;
    await Promise.resolve();
    expect(started).toEqual(['cqrs', 'graphql']);
    gate.resolve();
    await expect(recordPromise).resolves.toEqual({
      cqrs: 'cqrs-result',
      graphql: 'graphql-result',
    });

    await expect(
      runtime.parallel([Promise.resolve(1), () => Promise.resolve(2)]),
    ).resolves.toEqual([1, 2]);
  });
});

// === L1: IN-PROCESS INTEGRATION TESTS ===

describe('[L1:INTEGRATION] direct TypeScript workflow scheduler', () => {
  test('[L1:INTEGRATION] TS-GC2-003 forwards actual typed outputs, model/reasoning/schema, bounded concurrency, lineage, phases, and artifacts', async () => {
    const runtime = api();
    const events: WorkflowEvent[] = [];
    const requests: AgentExecutionRequest[] = [];
    let active = 0;
    let maximumActive = 0;
    const artifacts: ArtifactResult[] = [];
    const definition = runtime.defineWorkflow<
      { topic: string },
      { proposal: string; artifactPath: string }
    >({
      id: 'scheduler-contract',
      maxConcurrency: 2,
      run: async (input) => {
        const research = (await runtime.phase('Research', () =>
          runtime.parallel({
            cqrs: () =>
              runtime.agent<string, { topic: string }>({
                label: 'cqrs',
                model: 'gpt-5.6-luna',
                reasoning: 'medium',
                prompt: 'private cqrs prompt',
                input,
              }),
            graphql: () =>
              runtime.agent<string, { topic: string }>({
                label: 'graphql',
                model: 'gpt-5.6-luna',
                reasoning: 'medium',
                prompt: 'private graphql prompt',
                input,
              }),
          }),
        )) as { cqrs: string; graphql: string };
        const consolidated = await runtime.agent<
          { proposal: string },
          typeof research
        >({
          label: 'consolidate',
          model: 'gpt-5.6-luna',
          reasoning: 'medium',
          prompt: 'private consolidator prompt',
          input: research,
          outputSchema: {
            type: 'object',
            additionalProperties: false,
            required: ['proposal'],
            properties: { proposal: { type: 'string' } },
          },
        });
        const saved = await runtime.artifact('proposal.md', {
          value: consolidated.proposal,
          mediaType: 'text/markdown',
        });
        return {
          proposal: consolidated.proposal,
          artifactPath: saved.path,
        };
      },
    });

    const result = await runtime.executeWorkflow(
      definition,
      { topic: 'ResolverFactory' },
      {
        runId: 'run-contract-001',
        async executeAgent(request) {
          requests.push(request);
          active += 1;
          maximumActive = Math.max(maximumActive, active);
          await new Promise((resolve) => setTimeout(resolve, 10));
          active -= 1;
          if (request.label === 'consolidate') {
            expect(request.input).toEqual({
              cqrs: 'cqrs-result',
              graphql: 'graphql-result',
            });
            return {
              threadId: 'thread-consolidate',
              finalResponse: '{"proposal":"decision-ready"}',
              usage: null,
            };
          }
          return {
            threadId: `thread-${request.label}`,
            finalResponse: `${request.label}-result`,
            usage: null,
          };
        },
        async writeArtifact(request) {
          const artifact: ArtifactResult = {
            name: request.name,
            path: `/bounded/run-contract-001/artifacts/${request.name}`,
            digest: `sha256:${'a'.repeat(64)}`,
            mediaType: request.mediaType ?? 'application/json',
          };
          artifacts.push(artifact);
          return artifact;
        },
        onEvent(event) {
          events.push(event);
        },
      },
    );

    expect(maximumActive).toBe(2);
    expect(active).toBe(0);
    expect(result.output).toEqual({
      proposal: 'decision-ready',
      artifactPath: '/bounded/run-contract-001/artifacts/proposal.md',
    });
    expect(artifacts).toHaveLength(1);
    expect(
      requests.map(({ model, reasoning }) => ({ model, reasoning })),
    ).toEqual([
      { model: 'gpt-5.6-luna', reasoning: 'medium' },
      { model: 'gpt-5.6-luna', reasoning: 'medium' },
      { model: 'gpt-5.6-luna', reasoning: 'medium' },
    ]);
    const frozen = events.filter((event) => event.type === 'node.frozen');
    expect(frozen).toHaveLength(3);
    expect(frozen.every((event) => Object.isFrozen(event.node))).toBe(true);
    expect(frozen[2]?.node?.dependencies).toHaveLength(2);
    expect(frozen[2]?.node).toEqual(
      expect.objectContaining({
        label: 'consolidate',
        model: 'gpt-5.6-luna',
        reasoning: 'medium',
        promptDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        inputDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      }),
    );
    expect(events.some((event) => event.type === 'phase.started')).toBe(true);
    expect(events.some((event) => event.type === 'phase.completed')).toBe(true);
    const publicBytes = JSON.stringify(events);
    expect(publicBytes).not.toContain('private cqrs prompt');
    expect(publicBytes).not.toContain('private graphql prompt');
    expect(publicBytes).not.toContain('private consolidator prompt');
    expect(publicBytes).not.toContain('ResolverFactory');
  });

  test('[L1:INTEGRATION] CRA-RG-GC1-004 freezes a command policy digest and fails closed when the host omits evidence', async () => {
    const runtime = api();
    const events: WorkflowEvent[] = [];
    const definition = runtime.defineWorkflow<Record<string, never>, string>({
      id: 'command-evidence-contract',
      run: () =>
        runtime.agent({
          label: 'policy-bound',
          model: 'gpt-5.6-luna',
          reasoning: 'medium',
          prompt: 'execute the admitted operation',
          commandEvidence: {
            rules: [
              {
                id: 'admitted-operation',
                includes: '/private/admitted-operation',
                expectedCount: 1,
              },
            ],
          },
        }),
    });

    await expect(
      runtime.executeWorkflow(
        definition,
        {},
        {
          runId: 'run-command-evidence-missing',
          async executeAgent() {
            return {
              threadId: 'thread-command-evidence',
              finalResponse: 'unproved output',
              usage: null,
            };
          },
          async writeArtifact() {
            throw new Error('artifact writer must not run');
          },
          onEvent(event) {
            events.push(event);
          },
        },
      ),
    ).rejects.toEqual(
      expect.objectContaining({ code: 'WORKFLOW_AGENT_FAILED' }),
    );
    expect(events.find((event) => event.type === 'node.frozen')?.node).toEqual(
      expect.objectContaining({
        commandEvidencePolicyDigest: expect.stringMatching(
          /^sha256:[a-f0-9]{64}$/,
        ),
      }),
    );
    expect(JSON.stringify(events)).not.toContain('/private/admitted-operation');
  });

  test.each([
    ['empty', [] as const],
    ['fabricated-zero', [`sha256:${'0'.repeat(64)}`] as const],
  ])(
    '[L1:INTEGRATION] PR1-L1-003 rejects %s host-projected command evidence without runtime attestation',
    async (_caseName, commandDigests) => {
      const runtime = api();
      const policy = {
        rules: [
          {
            id: 'admitted-operation',
            includes: '/private/admitted-operation',
            expectedCount: 1,
          },
        ],
      };
      const body = {
        schemaVersion: 1 as const,
        policyDigest: publicApi.sha256(publicApi.canonicalizeJson(policy)),
        totalCompletedCommands: commandDigests.length,
        commandDigests: [...commandDigests],
        rules: [
          {
            id: 'admitted-operation',
            expectedCount: 1,
            observedCount: 1,
            passed: true,
          },
        ],
      };
      const forgedEvidence = {
        ...body,
        digest: publicApi.sha256(publicApi.canonicalizeJson(body)),
      };
      const definition = runtime.defineWorkflow<Record<string, never>, string>({
        id: `reject-${_caseName}-command-evidence`,
        run: () =>
          runtime.agent({
            label: 'policy-bound',
            model: 'gpt-5.6-luna',
            reasoning: 'medium',
            prompt: 'execute the admitted operation',
            commandEvidence: policy,
          }),
      });

      await expect(
        runtime.executeWorkflow(definition, {}, {
          runId: `run-reject-${_caseName}`,
          async executeAgent() {
            return {
              threadId: `thread-${_caseName}`,
              finalResponse: 'forged output',
              usage: null,
              commandEvidence: forgedEvidence,
            };
          },
          async writeArtifact() {
            throw new Error('artifact writer must not run');
          },
          onEvent() {
            return undefined;
          },
        }),
      ).rejects.toEqual(
        expect.objectContaining({ code: 'WORKFLOW_AGENT_FAILED' }),
      );
    },
  );

  test('[L1:INTEGRATION] TS-GC2-004 propagates agent failure, aborts running and queued siblings, and drains scheduler work', async () => {
    const runtime = api();
    const events: WorkflowEvent[] = [];
    const started: string[] = [];
    let active = 0;
    const definition = runtime.defineWorkflow<Record<string, never>, unknown>({
      id: 'failure-contract',
      maxConcurrency: 2,
      run: async () =>
        runtime.parallel([
          () =>
            runtime.agent({
              label: 'fails',
              model: 'gpt-5.6-luna',
              reasoning: 'medium',
              prompt: 'fail',
            }),
          () =>
            runtime.agent({
              label: 'running',
              model: 'gpt-5.6-luna',
              reasoning: 'medium',
              prompt: 'wait',
            }),
          () =>
            runtime.agent({
              label: 'queued',
              model: 'gpt-5.6-luna',
              reasoning: 'medium',
              prompt: 'must never launch',
            }),
        ]),
    });

    await expect(
      runtime.executeWorkflow(
        definition,
        {},
        {
          runId: 'run-contract-failure',
          async executeAgent(request) {
            started.push(request.label);
            active += 1;
            try {
              if (request.label === 'fails') {
                await Promise.resolve();
                throw new Error('raw secret failure detail');
              }
              await new Promise<void>((_resolve, reject) => {
                request.signal.addEventListener(
                  'abort',
                  () => reject(new Error('aborted raw secret detail')),
                  { once: true },
                );
              });
              throw new Error('unreachable');
            } finally {
              active -= 1;
            }
          },
          async writeArtifact() {
            throw new Error('artifact writer must not run');
          },
          onEvent(event) {
            events.push(event);
          },
        },
      ),
    ).rejects.toEqual(
      expect.objectContaining({ code: 'WORKFLOW_AGENT_FAILED' }),
    );
    expect(started).toEqual(['fails', 'running']);
    expect(active).toBe(0);
    expect(JSON.stringify(events)).not.toContain('raw secret');
    expect(events.some((event) => event.outcome === 'failed')).toBe(true);
    expect(events.some((event) => event.outcome === 'cancelled')).toBe(true);
  });

  test('[L1:INTEGRATION] TS-GC2-005 enforces output schemas and external cancellation with redacted failures', async () => {
    const runtime = api();
    const invalid = runtime.defineWorkflow<Record<string, never>, unknown>({
      id: 'schema-contract',
      run: () =>
        runtime.agent<{ accepted: boolean }>({
          label: 'schema',
          model: 'gpt-5.6-luna',
          reasoning: 'medium',
          prompt: 'schema',
          outputSchema: {
            type: 'object',
            additionalProperties: false,
            required: ['accepted'],
            properties: { accepted: { type: 'boolean' } },
          },
        }),
    });
    await expect(
      runtime.executeWorkflow(
        invalid,
        {},
        {
          runId: 'run-contract-schema',
          async executeAgent() {
            return {
              threadId: 'thread-schema',
              finalResponse: '{"accepted":"not-a-boolean"}',
              usage: null,
            };
          },
          async writeArtifact() {
            throw new Error('artifact writer must not run');
          },
          onEvent() {
            return undefined;
          },
        },
      ),
    ).rejects.toEqual(
      expect.objectContaining({ code: 'WORKFLOW_OUTPUT_SCHEMA_FAILED' }),
    );

    const controller = new AbortController();
    const cancelled = runtime.defineWorkflow<Record<string, never>, unknown>({
      id: 'cancel-contract',
      run: () =>
        runtime.agent({
          label: 'cancel',
          model: 'gpt-5.6-luna',
          reasoning: 'medium',
          prompt: 'wait',
        }),
    });
    const execution = runtime.executeWorkflow(
      cancelled,
      {},
      {
        runId: 'run-contract-cancel',
        signal: controller.signal,
        async executeAgent(request) {
          await new Promise<void>((_resolve, reject) => {
            request.signal.addEventListener(
              'abort',
              () => reject(new Error('raw cancellation detail')),
              { once: true },
            );
          });
          throw new Error('unreachable');
        },
        async writeArtifact() {
          throw new Error('artifact writer must not run');
        },
        onEvent() {
          return undefined;
        },
      },
    );
    await Promise.resolve();
    controller.abort();
    await expect(execution).rejects.toEqual(
      expect.objectContaining({ code: 'WORKFLOW_CANCELLED' }),
    );
  });

  test('[L1:INTEGRATION] DF-GC1-001 drains every started agent and artifact operation before one terminal event and promise settlement', async () => {
    const runtime = api();
    const events: WorkflowEvent[] = [];
    const bothStarted = deferred();
    const slowSettled = deferred();
    let started = 0;
    let active = 0;
    let activeAtRejection = -1;
    const definition = runtime.defineWorkflow<Record<string, never>, unknown>({
      id: 'drain-before-terminal',
      maxConcurrency: 2,
      run: () =>
        runtime.parallel([
          () =>
            runtime.agent({
              label: 'fails-first',
              model: 'gpt-5.6-luna',
              reasoning: 'medium',
              prompt: 'fail after both operations start',
            }),
          () =>
            runtime.agent({
              label: 'ignores-abort',
              model: 'gpt-5.6-luna',
              reasoning: 'medium',
              prompt: 'finish after the failure without observing abort',
            }),
        ]),
    });

    try {
      await runtime.executeWorkflow(
        definition,
        {},
        {
          runId: 'df-drain-red',
          async executeAgent(request) {
            active += 1;
            started += 1;
            if (started === 2) bothStarted.resolve();
            await bothStarted.promise;
            if (request.label === 'fails-first') {
              active -= 1;
              throw new Error('controlled failure');
            }
            await new Promise((resolveDelay) => setTimeout(resolveDelay, 60));
            active -= 1;
            slowSettled.resolve();
            return {
              threadId: 'thread-ignores-abort',
              finalResponse: 'late-success',
              usage: null,
            };
          },
          async writeArtifact() {
            throw new Error('artifact writer must not run');
          },
          onEvent(event) {
            events.push(event);
          },
        },
      );
      throw new Error('execution unexpectedly completed');
    } catch (error) {
      activeAtRejection = active;
      expect(error).toEqual(
        expect.objectContaining({ code: 'WORKFLOW_AGENT_FAILED' }),
      );
    }
    await slowSettled.promise;
    const terminalIndex = events.findIndex((event) =>
      ['workflow.failed', 'workflow.cancelled', 'workflow.completed'].includes(
        event.type,
      ),
    );
    expect(activeAtRejection).toBe(0);
    expect(active).toBe(0);
    expect(terminalIndex).toBe(events.length - 1);
    expect(
      events.filter((event) => event.type === 'workflow.failed'),
    ).toHaveLength(1);
  });

  test('[L1:INTEGRATION] DF-GC1-001 cancels a queued sibling without launching it and emits one terminal event last', async () => {
    const runtime = api();
    const events: WorkflowEvent[] = [];
    const launched: string[] = [];
    const definition = runtime.defineWorkflow<Record<string, never>, unknown>({
      id: 'drain-queued-sibling',
      maxConcurrency: 1,
      run: () =>
        runtime.parallel([
          () =>
            runtime.agent({
              label: 'first-failure',
              model: 'gpt-5.6-luna',
              reasoning: 'medium',
              prompt: 'fail before the queued sibling starts',
            }),
          () =>
            runtime.agent({
              label: 'must-remain-queued',
              model: 'gpt-5.6-luna',
              reasoning: 'medium',
              prompt: 'must never launch',
            }),
        ]),
    });

    await expect(
      runtime.executeWorkflow(
        definition,
        {},
        {
          runId: 'df-drain-queued',
          async executeAgent(request) {
            launched.push(request.label);
            throw new Error('controlled first failure');
          },
          async writeArtifact() {
            throw new Error('artifact writer must not run');
          },
          onEvent(event) {
            events.push(event);
          },
        },
      ),
    ).rejects.toEqual(
      expect.objectContaining({ code: 'WORKFLOW_AGENT_FAILED' }),
    );
    expect(launched).toEqual(['first-failure']);
    expect(events.at(-1)?.type).toBe('workflow.failed');
    expect(
      events.filter((event) =>
        [
          'workflow.failed',
          'workflow.cancelled',
          'workflow.completed',
        ].includes(event.type),
      ),
    ).toHaveLength(1);
  });

  test('[L1:INTEGRATION] DF-GC1-001 settles a successful artifact operation before workflow completion', async () => {
    const runtime = api();
    const events: WorkflowEvent[] = [];
    let activeArtifactWrites = 0;
    const definition = runtime.defineWorkflow<Record<string, never>, unknown>({
      id: 'drain-success-order',
      run: async () => {
        const result = await runtime.agent({
          label: 'successful-agent',
          model: 'gpt-5.6-luna',
          reasoning: 'medium',
          prompt: 'complete before the artifact',
        });
        return runtime.artifact('success.txt', result);
      },
    });

    await runtime.executeWorkflow(
      definition,
      {},
      {
        runId: 'df-drain-success',
        async executeAgent() {
          return {
            threadId: 'thread-success',
            finalResponse: 'settled bytes',
            usage: null,
          };
        },
        async writeArtifact(request) {
          activeArtifactWrites += 1;
          await new Promise((resolveDelay) => setTimeout(resolveDelay, 10));
          activeArtifactWrites -= 1;
          return {
            name: request.name,
            path: `/bounded/df-drain-success/${request.name}`,
            digest: `sha256:${'a'.repeat(64)}`,
            mediaType: request.mediaType ?? 'text/plain',
          };
        },
        onEvent(event) {
          events.push(event);
        },
      },
    );
    expect(activeArtifactWrites).toBe(0);
    expect(events.at(-1)?.type).toBe('workflow.completed');
    expect(events.findIndex((event) => event.type === 'artifact.created')).toBe(
      events.length - 2,
    );
  });

  test('[L1:INTEGRATION] DF-GC1-002 records only identity-bearing consumed provenance for structurally equal outputs', async () => {
    const runtime = api();
    const events: WorkflowEvent[] = [];
    const definition = runtime.defineWorkflow<Record<string, never>, unknown>({
      id: 'identity-provenance',
      run: async () => {
        const roots = (await runtime.parallel([
          () =>
            runtime.agent<{ value: string }>({
              label: 'root-one',
              model: 'gpt-5.6-luna',
              reasoning: 'medium',
              prompt: 'first equal object',
              outputSchema: {
                type: 'object',
                additionalProperties: false,
                required: ['value'],
                properties: { value: { type: 'string' } },
              },
            }),
          () =>
            runtime.agent<{ value: string }>({
              label: 'root-two',
              model: 'gpt-5.6-luna',
              reasoning: 'medium',
              prompt: 'second equal object',
              outputSchema: {
                type: 'object',
                additionalProperties: false,
                required: ['value'],
                properties: { value: { type: 'string' } },
              },
            }),
        ])) as [{ value: string }, { value: string }];
        return runtime.agent({
          label: 'consume-only-root-one',
          model: 'gpt-5.6-luna',
          reasoning: 'medium',
          prompt: 'consume one identity',
          input: { selected: roots[0] },
        });
      },
    });
    let call = 0;
    await runtime.executeWorkflow(
      definition,
      {},
      {
        runId: 'df-provenance-red',
        async executeAgent() {
          call += 1;
          return {
            threadId: `thread-${call}`,
            finalResponse: call <= 2 ? '{"value":"same"}' : 'joined',
            usage: null,
          };
        },
        async writeArtifact() {
          throw new Error('artifact writer must not run');
        },
        onEvent(event) {
          events.push(event);
        },
      },
    );
    const frozen = events.filter((event) => event.type === 'node.frozen');
    expect(frozen[2]?.node?.dependencies).toEqual([frozen[0]?.node?.id]);
  });

  test('[L1:INTEGRATION] DF-GC1-002 fails closed on ambiguous equal primitive provenance', async () => {
    const runtime = api();
    let adapterCalls = 0;
    const definition = runtime.defineWorkflow<Record<string, never>, unknown>({
      id: 'ambiguous-primitive-provenance',
      run: async () => {
        const roots = (await runtime.parallel([
          () =>
            runtime.agent({
              label: 'primitive-one',
              model: 'gpt-5.6-luna',
              reasoning: 'medium',
              prompt: 'first equal primitive',
            }),
          () =>
            runtime.agent({
              label: 'primitive-two',
              model: 'gpt-5.6-luna',
              reasoning: 'medium',
              prompt: 'second equal primitive',
            }),
        ])) as [string, string];
        return runtime.agent({
          label: 'ambiguous-consumer',
          model: 'gpt-5.6-luna',
          reasoning: 'medium',
          prompt: 'must fail before launch',
          input: roots[0],
        });
      },
    });
    await expect(
      runtime.executeWorkflow(
        definition,
        {},
        {
          runId: 'df-provenance-primitive-ambiguous',
          async executeAgent() {
            adapterCalls += 1;
            return {
              threadId: `thread-${adapterCalls}`,
              finalResponse: 'same primitive',
              usage: null,
            };
          },
          async writeArtifact() {
            throw new Error('artifact writer must not run');
          },
          onEvent() {
            return undefined;
          },
        },
      ),
    ).rejects.toEqual(
      expect.objectContaining({ code: 'WORKFLOW_DEFINITION_INVALID' }),
    );
    expect(adapterCalls).toBe(2);
  });

  test('[L1:INTEGRATION] DF-GC1-002 preserves one dependency through nested aliases of the same object', async () => {
    const runtime = api();
    const events: WorkflowEvent[] = [];
    let call = 0;
    const definition = runtime.defineWorkflow<Record<string, never>, unknown>({
      id: 'nested-alias-provenance',
      run: async () => {
        const root = await runtime.agent<{ value: string }>({
          label: 'aliased-root',
          model: 'gpt-5.6-luna',
          reasoning: 'medium',
          prompt: 'produce an identity-bearing object',
          outputSchema: {
            type: 'object',
            additionalProperties: false,
            required: ['value'],
            properties: { value: { type: 'string' } },
          },
        });
        return runtime.agent({
          label: 'nested-alias-consumer',
          model: 'gpt-5.6-luna',
          reasoning: 'medium',
          prompt: 'consume two aliases of one identity',
          input: { nested: { first: root, second: root } },
        });
      },
    });
    await runtime.executeWorkflow(
      definition,
      {},
      {
        runId: 'df-provenance-nested-alias',
        async executeAgent() {
          call += 1;
          return {
            threadId: `thread-${call}`,
            finalResponse: call === 1 ? '{"value":"identity"}' : 'done',
            usage: null,
          };
        },
        async writeArtifact() {
          throw new Error('artifact writer must not run');
        },
        onEvent(event) {
          events.push(event);
        },
      },
    );
    const frozen = events.filter((event) => event.type === 'node.frozen');
    expect(frozen[1]?.node?.dependencies).toEqual([frozen[0]?.node?.id]);
  });

  test('[L1:INTEGRATION] DF-GC1-002 does not manufacture provenance for a copied literal', async () => {
    const runtime = api();
    const events: WorkflowEvent[] = [];
    let call = 0;
    const definition = runtime.defineWorkflow<Record<string, never>, unknown>({
      id: 'copied-literal-provenance',
      run: async () => {
        const root = await runtime.agent<{ value: string }>({
          label: 'object-root',
          model: 'gpt-5.6-luna',
          reasoning: 'medium',
          prompt: 'produce an object',
          outputSchema: {
            type: 'object',
            additionalProperties: false,
            required: ['value'],
            properties: { value: { type: 'string' } },
          },
        });
        return runtime.agent({
          label: 'copied-literal-consumer',
          model: 'gpt-5.6-luna',
          reasoning: 'medium',
          prompt: 'consume a copied literal without claiming object identity',
          input: { copied: { value: root.value } },
        });
      },
    });
    await runtime.executeWorkflow(
      definition,
      {},
      {
        runId: 'df-provenance-copied-literal',
        async executeAgent() {
          call += 1;
          return {
            threadId: `thread-${call}`,
            finalResponse: call === 1 ? '{"value":"copy"}' : 'done',
            usage: null,
          };
        },
        async writeArtifact() {
          throw new Error('artifact writer must not run');
        },
        onEvent(event) {
          events.push(event);
        },
      },
    );
    const frozen = events.filter((event) => event.type === 'node.frozen');
    expect(frozen[1]?.node?.dependencies).toEqual([]);
  });

  test('[L1:INTEGRATION] DF-GC1-002 records one ordinary unique primitive producer', async () => {
    const runtime = api();
    const events: WorkflowEvent[] = [];
    let call = 0;
    const definition = runtime.defineWorkflow<Record<string, never>, unknown>({
      id: 'unique-primitive-provenance',
      run: async () => {
        const root = await runtime.agent({
          label: 'unique-primitive-root',
          model: 'gpt-5.6-luna',
          reasoning: 'medium',
          prompt: 'produce one unique primitive',
        });
        return runtime.agent({
          label: 'unique-primitive-consumer',
          model: 'gpt-5.6-luna',
          reasoning: 'medium',
          prompt: 'consume the unique primitive',
          input: { selected: root },
        });
      },
    });
    await runtime.executeWorkflow(
      definition,
      {},
      {
        runId: 'df-provenance-unique-primitive',
        async executeAgent() {
          call += 1;
          return {
            threadId: `thread-${call}`,
            finalResponse: call === 1 ? 'unique primitive' : 'done',
            usage: null,
          };
        },
        async writeArtifact() {
          throw new Error('artifact writer must not run');
        },
        onEvent(event) {
          events.push(event);
        },
      },
    );
    const frozen = events.filter((event) => event.type === 'node.frozen');
    expect(frozen[1]?.node?.dependencies).toEqual([frozen[0]?.node?.id]);
  });

  test('[L1:INTEGRATION] DF-GC1-005 admits only exact gpt-5.6-luna with medium reasoning before adapter launch', async () => {
    const runtime = api();
    let adapterCalls = 0;
    const definition = runtime.defineWorkflow<Record<string, never>, unknown>({
      id: 'runtime-policy-red',
      run: () =>
        runtime.agent({
          label: 'runtime-cast-bypass',
          model: 'gpt-5.6-luna',
          reasoning: ['not', 'a', 'reasoning', 'level'].join('-'),
          prompt: 'must fail before launch',
        } as unknown as AgentOptions),
    });
    await expect(
      runtime.executeWorkflow(
        definition,
        {},
        {
          runId: 'df-policy-red',
          async executeAgent() {
            adapterCalls += 1;
            return {
              threadId: 'forbidden-thread',
              finalResponse: 'forbidden-success',
              usage: null,
            };
          },
          async writeArtifact() {
            throw new Error('artifact writer must not run');
          },
          onEvent() {
            return undefined;
          },
        },
      ),
    ).rejects.toEqual(
      expect.objectContaining({ code: 'WORKFLOW_DEFINITION_INVALID' }),
    );
    expect(adapterCalls).toBe(0);
  });

  test.each([
    'gpt-5.6-luna',
    'gpt-5.6-terra',
    'gpt-5.6-sol',
    'gpt-future-model.v2',
  ])(
    '[L1:INTEGRATION] GPT-GC1-001 forwards valid model %s unchanged exactly once',
    async (model) => {
      const runtime = api();
      let adapterCalls = 0;
      const definition = runtime.defineWorkflow<Record<string, never>, unknown>(
        {
          id: `runtime-policy-valid-${model.replaceAll('.', '-')}`,
          run: () =>
            runtime.agent({
              label: 'valid-policy',
              model,
              reasoning: 'medium',
              prompt: 'launch exactly once',
            } as AgentOptions),
        },
      );
      await runtime.executeWorkflow(
        definition,
        {},
        {
          runId: 'df-policy-valid',
          async executeAgent(request) {
            adapterCalls += 1;
            expect(request.model).toBe(model);
            expect(request.reasoning).toBe('medium');
            return {
              threadId: 'valid-thread',
              finalResponse: 'valid',
              usage: null,
            };
          },
          async writeArtifact() {
            throw new Error('artifact writer must not run');
          },
          onEvent() {
            return undefined;
          },
        },
      );
      expect(adapterCalls).toBe(1);
    },
  );

  test.each([
    ['non-gpt model', { model: 'o4-mini' }],
    ['missing model suffix', { model: 'gpt-' }],
    ['whitespace-bearing model', { model: 'gpt-5.6 terra' }],
    ['control-bearing model', { model: 'gpt-5.6\u0000terra' }],
    ['overlong model', { model: `gpt-${'x'.repeat(253)}` }],
    ['invalid reasoning', { reasoning: 'high' }],
    ['empty model', { model: '' }],
    ['empty reasoning', { reasoning: '' }],
    ['empty prompt', { prompt: '' }],
  ])(
    '[L1:INTEGRATION] DF-GC1-005 rejects %s before adapter launch',
    async (_name, override) => {
      const runtime = api();
      let adapterCalls = 0;
      const definition = runtime.defineWorkflow<Record<string, never>, unknown>(
        {
          id: `runtime-policy-${String(_name).replaceAll(' ', '-')}`,
          run: () =>
            runtime.agent({
              label: 'invalid-policy',
              model: 'gpt-5.6-luna',
              reasoning: 'medium',
              prompt: 'must fail before launch',
              ...override,
            } as unknown as AgentOptions),
        },
      );
      await expect(
        runtime.executeWorkflow(
          definition,
          {},
          {
            runId: `df-policy-${String(_name).replaceAll(' ', '-')}`,
            async executeAgent() {
              adapterCalls += 1;
              return {
                threadId: 'forbidden-thread',
                finalResponse: 'forbidden',
                usage: null,
              };
            },
            async writeArtifact() {
              throw new Error('artifact writer must not run');
            },
            onEvent() {
              return undefined;
            },
          },
        ),
      ).rejects.toEqual(
        expect.objectContaining({ code: 'WORKFLOW_DEFINITION_INVALID' }),
      );
      expect(adapterCalls).toBe(0);
    },
  );

  test('[L1:INTEGRATION] DF-GC1-006 rejects host-incompatible structured-output schemas before launch', async () => {
    const runtime = api();
    let adapterCalls = 0;
    const definition = runtime.defineWorkflow<Record<string, never>, unknown>({
      id: 'host-schema-red',
      run: () =>
        runtime.agent<{ status: string }>({
          label: 'host-invalid-schema',
          model: 'gpt-5.6-luna',
          reasoning: 'medium',
          prompt: 'must fail admission',
          outputSchema: {
            type: 'object',
            additionalProperties: false,
            required: ['status'],
            properties: { status: { const: 'ok' } },
          },
        }),
    });
    await expect(
      runtime.executeWorkflow(
        definition,
        {},
        {
          runId: 'df-host-schema-red',
          async executeAgent() {
            adapterCalls += 1;
            return {
              threadId: 'forbidden-thread',
              finalResponse: '{"status":"ok"}',
              usage: null,
            };
          },
          async writeArtifact() {
            throw new Error('artifact writer must not run');
          },
          onEvent() {
            return undefined;
          },
        },
      ),
    ).rejects.toEqual(
      expect.objectContaining({ code: 'WORKFLOW_DEFINITION_INVALID' }),
    );
    expect(adapterCalls).toBe(0);
  });

  test.each([
    [
      'typed const',
      {
        type: 'object',
        additionalProperties: false,
        required: ['status'],
        properties: { status: { type: 'string', const: 'ok' } },
      },
      '{"status":"ok"}',
    ],
    ['array', { type: 'array', items: { type: 'string' } }, '["ok"]'],
    ['string', { type: 'string', minLength: 1 }, '"ok"'],
  ])(
    '[L1:INTEGRATION] DF-GC1-006 admits supported %s output schema',
    async (_name, schema, response) => {
      const runtime = api();
      let adapterCalls = 0;
      const definition = runtime.defineWorkflow<Record<string, never>, unknown>(
        {
          id: `host-schema-supported-${String(_name).toLowerCase().replaceAll(' ', '-')}`,
          run: () =>
            runtime.agent({
              label: 'host-supported-schema',
              model: 'gpt-5.6-luna',
              reasoning: 'medium',
              prompt: 'admitted schema',
              outputSchema: schema as JsonSchema,
            }),
        },
      );
      await runtime.executeWorkflow(
        definition,
        {},
        {
          runId: `df-host-schema-supported-${String(_name).toLowerCase().replaceAll(' ', '-')}`,
          async executeAgent() {
            adapterCalls += 1;
            return {
              threadId: 'supported-thread',
              finalResponse: String(response),
              usage: null,
            };
          },
          async writeArtifact() {
            throw new Error('artifact writer must not run');
          },
          onEvent() {
            return undefined;
          },
        },
      );
      expect(adapterCalls).toBe(1);
    },
  );

  test.each([
    ['root const without type', { const: 'ok' }],
    [
      'array item const without type',
      { type: 'array', items: { const: 'ok' } },
    ],
    [
      'anyOf const without type',
      { anyOf: [{ const: 'ok' }, { type: 'string' }] },
    ],
  ])(
    '[L1:INTEGRATION] DF-GC1-006 rejects host-incompatible %s shape before launch',
    async (_name, schema) => {
      const runtime = api();
      let adapterCalls = 0;
      const definition = runtime.defineWorkflow<Record<string, never>, unknown>(
        {
          id: `host-schema-invalid-${String(_name).toLowerCase().replaceAll(' ', '-')}`,
          run: () =>
            runtime.agent({
              label: 'host-invalid-schema-matrix',
              model: 'gpt-5.6-luna',
              reasoning: 'medium',
              prompt: 'must fail admission',
              outputSchema: schema as JsonSchema,
            }),
        },
      );
      await expect(
        runtime.executeWorkflow(
          definition,
          {},
          {
            runId: `df-host-schema-invalid-${String(_name).toLowerCase().replaceAll(' ', '-')}`,
            async executeAgent() {
              adapterCalls += 1;
              return {
                threadId: 'forbidden-thread',
                finalResponse: '"ok"',
                usage: null,
              };
            },
            async writeArtifact() {
              throw new Error('artifact writer must not run');
            },
            onEvent() {
              return undefined;
            },
          },
        ),
      ).rejects.toEqual(
        expect.objectContaining({ code: 'WORKFLOW_DEFINITION_INVALID' }),
      );
      expect(adapterCalls).toBe(0);
    },
  );

  test('[L1:INTEGRATION] DF-GC1-010 forwards the exact public daily-facts publication path to the artifact boundary', async () => {
    const runtime = api();
    const writes: Array<{
      name: string;
      value: unknown;
      mediaType?: string;
      publishPath?: string;
    }> = [];
    const publicPath =
      '.agent/testing/workflows/20260810T170000Z/DAILY_FACTS.md';
    const definition = runtime.defineWorkflow<Record<string, never>, unknown>({
      id: 'public-report-bridge-red',
      run: () =>
        runtime.artifact('DAILY_FACTS.md', {
          value: '# Daily facts\n',
          mediaType: 'text/markdown',
          publishPath: publicPath,
        }),
    });
    await runtime.executeWorkflow(
      definition,
      {},
      {
        runId: 'df-public-report-red',
        async executeAgent() {
          throw new Error('agent must not run');
        },
        async writeArtifact(request) {
          writes.push(request);
          return {
            name: request.name,
            path: `/private/${request.name}`,
            ...(request.publishPath
              ? { publishedPath: `/workspace/${request.publishPath}` }
              : {}),
            digest: `sha256:${'a'.repeat(64)}`,
            mediaType: request.mediaType ?? 'text/markdown',
          };
        },
        onEvent() {
          return undefined;
        },
      },
    );
    expect(writes).toEqual([
      expect.objectContaining({
        name: 'DAILY_FACTS.md',
        publishPath: publicPath,
      }),
    ]);
  });
});

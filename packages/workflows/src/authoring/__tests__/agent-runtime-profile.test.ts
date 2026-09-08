import { describe, expect, it } from 'vitest';
import { agent, defineWorkflow } from '../api.js';
import { executeWorkflow } from '../execution.js';
import { prepareWorkflowRun } from '../../control/run-workflow.js';

const command = (model = 'gpt-5.6-luna', reasoningEffort = 'high') => ({
  workflowRef: 'profile-demo',
  sourceDigest: `sha256:${'a'.repeat(64)}`,
  input: {},
  hostId: 'local',
  idempotencyKey: 'profile-demo',
  workspace: {
    repositoryId: 'codex',
    baseRevision: 'b'.repeat(40),
    assignmentId: 'CAS-RP-01',
  },
  runtimeProfile: {
    model,
    reasoningEffort,
    sandbox: 'readOnly',
    approvalPolicy: 'never',
  },
});

// === L1: IN-PROCESS INTEGRATION TESTS ===
describe('[L1:INTEGRATION] CAS-RP-01 agent runtime profiles', () => {
  it('CAS-NET-GC1-001 freezes and forwards omitted network access as enabled', async () => {
    const events: unknown[] = [];
    let executionRequest: Record<string, unknown> | undefined;
    await executeWorkflow(
      defineWorkflow({
        id: 'network-default',
        run: () =>
          agent({
            label: 'Default network',
            model: 'gpt-5.6-luna',
            reasoning: 'low',
            prompt: 'Inspect only.',
          }),
      }),
      {},
      {
        runId: 'network-default',
        async executeAgent(request) {
          executionRequest = request as unknown as Record<string, unknown>;
          return {
            threadId: 'thread-default',
            finalResponse: 'done',
            usage: null,
          };
        },
        async writeArtifact() {
          throw new Error('Unexpected artifact');
        },
        onEvent(event) {
          events.push(event);
        },
      },
    );

    expect(executionRequest).toMatchObject({
      networkAccess: true,
      node: { networkAccess: true },
    });
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'node.frozen',
          node: expect.objectContaining({ networkAccess: true }),
        }),
      ]),
    );
  });

  it('CAS-NET-GC1-002 freezes and forwards explicit network denial', async () => {
    let executionRequest: Record<string, unknown> | undefined;
    await executeWorkflow(
      defineWorkflow({
        id: 'network-deny',
        run: () =>
          agent({
            label: 'Denied network',
            model: 'gpt-5.6-luna',
            reasoning: 'low',
            networkAccess: false,
            prompt: 'Inspect only.',
          } as never),
      }),
      {},
      {
        runId: 'network-deny',
        async executeAgent(request) {
          executionRequest = request as unknown as Record<string, unknown>;
          return {
            threadId: 'thread-deny',
            finalResponse: 'done',
            usage: null,
          };
        },
        async writeArtifact() {
          throw new Error('Unexpected artifact');
        },
        onEvent() {
          return undefined;
        },
      },
    );

    expect(executionRequest).toMatchObject({
      networkAccess: false,
      node: { networkAccess: false },
    });
  });

  it.each(['false', 0, null, {}])(
    'CAS-NET-GC1-003 rejects malformed network access %j before freeze or launch',
    async (networkAccess) => {
      let calls = 0;
      const events: Array<{ type: string }> = [];
      await expect(
        executeWorkflow(
          defineWorkflow({
            id: 'invalid-network',
            run: () =>
              agent({
                label: 'Invalid network',
                model: 'gpt-5.6-luna',
                reasoning: 'low',
                networkAccess,
                prompt: 'Never launch.',
              } as never),
          }),
          {},
          {
            runId: 'invalid-network',
            async executeAgent() {
              calls += 1;
              return {
                threadId: 'forbidden',
                finalResponse: 'done',
                usage: null,
              };
            },
            async writeArtifact() {
              throw new Error('Unexpected artifact');
            },
            onEvent(event) {
              events.push(event);
            },
          },
        ),
      ).rejects.toMatchObject({ code: 'WORKFLOW_DEFINITION_INVALID' });
      expect(calls).toBe(0);
      expect(events.some(({ type }) => type === 'node.frozen')).toBe(false);
    },
  );

  it('RP-AUTHORING freezes and forwards independent model/effort pairs unchanged', async () => {
    const profiles = [
      ['gpt-5.6-luna', 'high'],
      ['gpt-5.6-sol', 'medium'],
      ['o3', 'low'],
      ['custom-model.v2', 'future-effort'],
    ] as const;
    const observed: unknown[] = [];
    const result = await executeWorkflow(
      defineWorkflow({
        id: 'profiles',
        run: async () => {
          for (const [model, reasoning] of profiles)
            await agent({
              label: model,
              model,
              reasoning,
              prompt: 'Inspect only.',
            });
        },
      }),
      {},
      {
        runId: 'profiles',
        async executeAgent(request) {
          observed.push([request.model, request.reasoning]);
          expect(request.node).toMatchObject({
            model: request.model,
            reasoning: request.reasoning,
          });
          return {
            threadId: `thread-${observed.length}`,
            finalResponse: 'done',
            usage: null,
          };
        },
        async writeArtifact() {
          throw new Error('Unexpected artifact');
        },
        onEvent() {
          return undefined;
        },
      },
    );
    expect(observed).toEqual(profiles);
    expect(result.nodes).toHaveLength(profiles.length);
  });

  it('RP-COMMAND preserves explicit profiles and fingerprints their differences', () => {
    const first = prepareWorkflowRun(command());
    expect(first.command.runtimeProfile).toMatchObject({
      model: 'gpt-5.6-luna',
      reasoningEffort: 'high',
    });
    expect(prepareWorkflowRun(command())).toEqual(first);
    for (const changed of [
      command('o3', 'high'),
      command('gpt-5.6-luna', 'low'),
    ]) {
      const other = prepareWorkflowRun(changed);
      expect(other.runId).toBe(first.runId);
      expect(other.requestFingerprint).not.toBe(first.requestFingerprint);
    }
  });

  it.each(['', 'high effort', 'high\n', 'x'.repeat(65), null, 4])(
    'rejects malformed effort %j before adapter launch',
    async (reasoning) => {
      let calls = 0;
      await expect(
        executeWorkflow(
          defineWorkflow({
            id: 'invalid-effort',
            run: () =>
              agent({
                label: 'invalid',
                model: 'gpt-5.6-luna',
                reasoning,
                prompt: 'Never launch.',
              } as never),
          }),
          {},
          {
            runId: 'invalid-effort',
            async executeAgent() {
              calls++;
              throw new Error('Must not call');
            },
            async writeArtifact() {
              throw new Error('Must not write');
            },
            onEvent() {
              return undefined;
            },
          },
        ),
      ).rejects.toMatchObject({ code: 'WORKFLOW_DEFINITION_INVALID' });
      expect(calls).toBe(0);
      expect(() =>
        prepareWorkflowRun({
          ...command(),
          runtimeProfile: {
            ...command().runtimeProfile,
            reasoningEffort: reasoning,
          },
        }),
      ).toThrow();
    },
  );
});

import { describe, it, expect, vi } from 'vitest';
import { agent, defineWorkflow, prepareWorkflowRun } from '@codex/workflows';
import { createWorkflowExecutionDaemon } from '../workflow-execution-daemon.js';
// === L1: UNIT TESTS ===
// === L1: IN-PROCESS INTEGRATION TESTS ===
describe('[L1:INTEGRATION] MEADOW bound retry custody', () => {
  it('MEADOW-L1-BOUND retains a bound ambiguous attempt and reconciles the same runtime on retry', async () => {
    const prepared = prepareWorkflowRun({
      workflowRef: 'retry.fixture',
      sourceDigest: `sha256:${'a'.repeat(64)}`,
      input: {},
      hostId: 'fixture',
      workspace: {
        repositoryId: 'repo',
        baseRevision: 'b'.repeat(40),
        assignmentId: 'assignment',
      },
      runtimeProfile: {
        model: 'gpt-5.6-luna',
        reasoningEffort: 'low',
        sandbox: 'readOnly',
        approvalPolicy: 'never',
      },
      idempotencyKey: 'bound-retry',
    });
    const events: Array<{
      streamId: string;
      sequence: bigint;
      kind: string;
      payload: Record<string, unknown>;
    }> = [];
    let execute: ((data: Record<string, unknown>) => Promise<void>) | undefined;
    const release = vi.fn(async () => undefined);
    const reconcile = vi.fn(async () => ({
      threadId: 'provider-thread',
      finalResponse: 'done',
      usage: null,
    }));
    const service = createWorkflowExecutionDaemon({
      store: {
        events: async (stream) =>
          events.filter((e) => e.streamId === stream) as never,
        execute: async (c) => {
          for (const e of c.events)
            events.push({
              ...e,
              streamId: c.streamId,
              sequence: BigInt(events.length + 1),
            });
          return {} as never;
        },
      },
      delivery: {
        start: async () => undefined,
        stop: async () => undefined,
        ensureQueue: async () => undefined,
        work: async (q, h) => {
          if (q === 'workflow-execution') execute = h;
          return q;
        },
      },
      hosts: { connect: async () => ({}) },
      workspaces: {
        acquire: async () => ({ workspaceRef: 'retained' }),
        resolve: async () => ({
          cwd: '/fixture',
          tempDirectory: '/fixture/tmp',
        }),
        release,
      },
      resolveWorkflow: async () => ({
        sourceDigest: prepared.command.sourceDigest,
        definition: defineWorkflow({
          id: 'retry',
          run: async () =>
            agent({
              label: 'Bound',
              model: 'gpt-5.6-luna',
              reasoning: 'low',
              prompt: 'fixture',
            }),
        }),
      }),
      createExecutor: () => ({
        executeAgent: async (request) => {
          await request.onRuntimeEvent({
            type: 'thread.started',
            nodeId: request.node.id,
            threadId: 'provider-thread',
          });
          throw Object.assign(Error('lost reply'), { ambiguous: true });
        },
        reconcileAgent: reconcile,
        close: async () => undefined,
      }),
    });
    await service.start();
    try {
      if (!execute) throw Error('MISSING_HANDLER');
      const job = { runId: prepared.runId, command: prepared.command };
      await expect(execute(job)).rejects.toThrow('A workflow agent failed.');
      expect(release).not.toHaveBeenCalled();
      await execute(job);
      expect(reconcile).toHaveBeenCalledOnce();
      expect(reconcile.mock.calls[0]).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ threadId: 'provider-thread' }),
        ]),
      );
      expect(release).toHaveBeenCalledOnce();
    } finally {
      await service.stop();
    }
  });
});

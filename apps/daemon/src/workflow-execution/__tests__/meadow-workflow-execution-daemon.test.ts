import { describe, it, expect, vi } from 'vitest';
import { defineWorkflow, prepareWorkflowRun } from '@codex/workflows';
import { createWorkflowExecutionDaemon } from '../workflow-execution-daemon.js';

// === L1: UNIT TESTS ===
// === L1: IN-PROCESS INTEGRATION TESTS ===
describe('[L1:INTEGRATION] MEADOW recovery', () => {
  function fixture(
    options: {
      acquireError?: boolean;
      releaseError?: boolean;
      watchError?: boolean;
      resolveError?: boolean;
    } = {},
  ) {
    const prepared = prepareWorkflowRun({
      workflowRef: 'meadow.fixture',
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
      idempotencyKey: 'meadow-one',
    });
    const events: Array<{
      streamId: string;
      sequence: bigint;
      kind: string;
      payload: Record<string, unknown>;
    }> = [];
    const handlers = new Map<
      string,
      (data: Record<string, unknown>) => Promise<void>
    >();
    const primary = Error('private /path token=secret');
    const acquire = vi.fn(async (input: unknown) => {
      void input;
      if (options.acquireError) throw primary;
      return { workspaceRef: 'owned' };
    });
    const release = vi.fn(async () => {
      if (options.releaseError) throw Error('private cleanup');
    });
    const executeAgent = vi.fn();
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
        ...(options.watchError
          ? {
              subscribe: async function* () {
                throw Error('private watcher');
                yield* [];
              },
            }
          : {}),
      },
      delivery: {
        start: async () => undefined,
        stop: async () => undefined,
        ensureQueue: async () => undefined,
        work: async (q, h) => {
          handlers.set(q, h);
          return q;
        },
      },
      workspaces: {
        acquire,
        resolve: async () => {
          if (options.resolveError) throw primary;
          return { cwd: '/fixture', tempDirectory: '/fixture/tmp' };
        },
        release,
      },
      hosts: { connect: async () => ({}) },
      resolveWorkflow: async () => ({
        definition: defineWorkflow({ id: 'fixture', run: async () => 'done' }),
        sourceDigest: prepared.command.sourceDigest,
      }),
      createExecutor: () => ({ executeAgent, close: async () => undefined }),
    });
    return {
      service,
      prepared,
      events,
      acquire,
      release,
      primary,
      async run(command = prepared.command) {
        await service.start();
        try {
          const handler = handlers.get('workflow-execution');
          if (!handler) throw Error('MISSING_WORKFLOW_HANDLER');
          await handler({
            runId: prepareWorkflowRun(command).runId,
            command,
          });
        } finally {
          await service.stop();
        }
      },
    };
  }
  it('MEADOW-L1-OWNER persists only the trusted coordinator admission identity', async () => {
    const f = fixture();
    const submit = f.service.runWorkflow as (
      c: typeof f.prepared.command,
      a: { actorAgentId: string; scopes: string[] },
    ) => Promise<unknown>;
    await submit(f.prepared.command, {
      actorAgentId: 'codex-control',
      scopes: ['control:workflow'],
    });
    expect(
      f.events.find((e) => e.kind === 'workflow.accepted')?.payload
        .ownerAgentId,
    ).toBe('codex-control');
    await expect(
      submit(
        { ...f.prepared.command, idempotencyKey: 'foreign' },
        { actorAgentId: 'foreign', scopes: [] },
      ),
    ).rejects.toThrow(/UNAUTHORIZED/);
  });
  for (const kind of [
    'workflow.completed',
    'workflow.cancelled',
    'workflow.failed',
  ])
    it(`MEADOW-L1-TERMINAL ${kind} remains immutable`, async () => {
      const f = fixture();
      f.events.push({
        streamId: `workflow:${f.prepared.runId}`,
        sequence: 1n,
        kind,
        payload: {},
      });
      await f.run();
      expect(f.acquire).not.toHaveBeenCalled();
      expect(f.events).toHaveLength(1);
    });
  it('MEADOW-L1-ATTEMPT records safe pre-step diagnostics with increasing retry identity', async () => {
    const f = fixture({ acquireError: true });
    await expect(f.run()).rejects.toBe(f.primary);
    await expect(f.run()).rejects.toBe(f.primary);
    expect(
      f.events
        .filter((e) => e.kind === 'workflow.execution.attempted')
        .map((e) => e.payload.attempt),
    ).toEqual([1, 2]);
    expect(
      f.events
        .filter((e) => e.kind === 'workflow.execution.error')
        .map((e) => e.payload),
    ).toEqual(
      [1, 2].map((attempt) =>
        expect.objectContaining({
          attempt,
          stage: 'acquire',
          code: 'WORKFLOW_SETUP_FAILED',
        }),
      ),
    );
    expect(
      JSON.stringify(f.events, (_, v) =>
        typeof v === 'bigint' ? String(v) : v,
      ),
    ).not.toMatch(/private|secret|\/path/);
  });
  it('MEADOW-L1-IDENTITY distinct runs receive distinct execution-scoped leases', async () => {
    const f = fixture();
    await f.run();
    await f.run({ ...f.prepared.command, idempotencyKey: 'meadow-two' });
    const inputs = f.acquire.mock.calls.map(
      (c) => c[0] as Record<string, unknown>,
    );
    expect(inputs[0].executionId).toBe(f.prepared.runId);
    expect(inputs[1].executionId).not.toBe(inputs[0].executionId);
  });
  it('MEADOW-L1-CLEANUP preserves the setup error and separately records release failure', async () => {
    const f = fixture({ resolveError: true, releaseError: true });
    await expect(f.run()).rejects.toBe(f.primary);
    expect(f.release).toHaveBeenCalledOnce();
    expect(f.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'workflow.cleanup.error',
          payload: expect.objectContaining({ stage: 'release' }),
        }),
      ]),
    );
  });
  it('MEADOW-L1-WATCH a failed cancellation watcher cannot prevent lease cleanup', async () => {
    const f = fixture({ watchError: true, resolveError: true });
    await expect(f.run()).rejects.toBe(f.primary);
    expect(f.release).toHaveBeenCalledOnce();
    expect(f.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'workflow.cleanup.error',
          payload: expect.objectContaining({ stage: 'cancellation-watch' }),
        }),
      ]),
    );
  });
});

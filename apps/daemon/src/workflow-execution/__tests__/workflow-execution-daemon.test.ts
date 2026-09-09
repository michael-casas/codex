import { describe, expect, it, vi } from 'vitest';
import {
  agent,
  artifact,
  defineWorkflow,
  prepareWorkflowRun,
} from '@codex/workflows';
import type { ExecuteControlCommand } from '@codex/db';

import * as daemon from '../../main.js';

// === L1: UNIT TESTS ===
describe('[L1:UNIT] remote workflow execution daemon', () => {
  it('CAS07-L1-COMMAND exposes one strict idempotent runWorkflow command', () => {
    expect(
      (daemon as Record<string, unknown>).createWorkflowExecutionDaemon,
      'CAS-07 durable runWorkflow composition is not implemented',
    ).toBeTypeOf('function');
  });

  it('CAS07-L1-CANCEL exposes cancellation through the same durable service', () => {
    expect(
      (daemon as Record<string, unknown>).createWorkflowExecutionDaemon,
      'CAS-07 cancellation is not implemented',
    ).toBeTypeOf('function');
  });

  it('returns one stable handle, replays exactly, rejects conflicts, and cancels before launch', async () => {
    const events: Array<{
      streamId: string;
      sequence: bigint;
      eventId: string;
      idempotencyKey: string;
      kind: string;
      payload: Record<string, unknown>;
      payloadSha256: `sha256:${string}`;
    }> = [];
    const commands = new Map<string, string>();
    const jobs: Record<string, unknown>[] = [];
    const store = {
      async execute(command: ExecuteControlCommand) {
        const fingerprint = JSON.stringify(command.payload);
        const existing = commands.get(command.idempotencyKey);
        if (existing && existing !== fingerprint)
          throw new Error('CONTROL_IDEMPOTENCY_CONFLICT');
        if (!existing) {
          commands.set(command.idempotencyKey, fingerprint);
          for (const event of command.events)
            events.push({
              streamId: command.streamId,
              sequence: BigInt(events.length + 1),
              eventId: event.eventId,
              idempotencyKey: command.idempotencyKey,
              kind: event.kind,
              payload: event.payload,
              payloadSha256: `sha256:${'0'.repeat(64)}`,
            });
          if (command.delivery) jobs.push(command.delivery.data);
        }
        return {
          commandId: command.commandId,
          cursor: events.at(-1)?.sequence.toString() ?? '0',
          eventCount: events.length,
          replaySha256: `sha256:${'0'.repeat(64)}`,
          replayed: Boolean(existing),
        };
      },
      async events(streamId: string) {
        return events.filter((event) => event.streamId === streamId);
      },
    };
    const service = daemon.createWorkflowExecutionDaemon({
      store: store as never,
      delivery: {
        async start() {
          return undefined;
        },
        async stop() {
          return undefined;
        },
        async ensureQueue() {
          return undefined;
        },
        async work() {
          return 'worker';
        },
      },
      hosts: {
        async connect() {
          throw new Error('must not launch');
        },
      },
      workspaces: {
        async acquire() {
          throw new Error('must not acquire');
        },
        async resolve() {
          throw new Error('must not resolve');
        },
        async release() {
          return undefined;
        },
      },
      async resolveWorkflow() {
        return {
          definition: defineWorkflow({
            id: 'unused',
            run: () => artifact('unused', 'unused'),
          }),
          sourceDigest: `sha256:${'a'.repeat(64)}`,
        };
      },
      createExecutor() {
        throw new Error('must not create');
      },
    });
    const command = {
      workflowRef: 'trusted.workflow',
      sourceDigest: `sha256:${'a'.repeat(64)}`,
      input: {},
      hostId: 'remote',
      workspace: {
        repositoryId: 'codex',
        baseRevision: 'b'.repeat(40),
        assignmentId: 'CAS-07',
      },
      runtimeProfile: {
        model: 'gpt-5.6-sol',
        reasoningEffort: 'medium',
        sandbox: 'workspaceWrite',
        approvalPolicy: 'never',
      },
      idempotencyKey: 'stable-1',
    } as const;
    const first = await service.runWorkflow(command);
    expect(await service.run_workflow(command)).toEqual(first);
    expect(await service.runWorkflow(command)).toEqual(first);
    expect(jobs).toHaveLength(1);
    await expect(
      service.runWorkflow({ ...command, input: { conflict: true } }),
    ).rejects.toThrow(/CONTROL_IDEMPOTENCY_CONFLICT/);
    expect(await service.cancelWorkflow(first.runId)).toMatchObject({
      runId: first.runId,
      state: 'cancelled',
    });
    expect(await service.cancelWorkflow(first.runId)).toMatchObject({
      state: 'cancelled',
    });
  });
});

// === L1: IN-PROCESS INTEGRATION TESTS ===
describe('[L1:INTEGRATION] workflow delivery failure cleanup', () => {
  it('CAS-NET-GC1-006 preserves effective network permission through durable execution and events', async () => {
    const prepared = prepareWorkflowRun({
      workflowRef: 'network.workflow',
      sourceDigest: `sha256:${'a'.repeat(64)}`,
      input: {},
      hostId: 'controlled',
      workspace: {
        repositoryId: 'fixture',
        baseRevision: 'b'.repeat(40),
        assignmentId: 'network-default',
      },
      runtimeProfile: {
        model: 'gpt-5.6-luna',
        reasoningEffort: 'low',
        sandbox: 'readOnly',
        approvalPolicy: 'never',
      },
      idempotencyKey: 'network-default',
    });
    const events: Array<{
      streamId: string;
      sequence: bigint;
      eventId: string;
      idempotencyKey: string;
      kind: string;
      payload: Record<string, unknown>;
      payloadSha256: `sha256:${string}`;
    }> = [];
    const handlers = new Map<
      string,
      (data: Readonly<Record<string, unknown>>) => Promise<void>
    >();
    const requests: Array<Record<string, unknown>> = [];
    const release = vi.fn(async () => undefined);
    const close = vi.fn(async () => undefined);
    const service = daemon.createWorkflowExecutionDaemon({
      store: {
        async events(streamId) {
          return events.filter((event) => event.streamId === streamId) as never;
        },
        async execute(command) {
          for (const event of command.events)
            events.push({
              streamId: command.streamId,
              sequence: BigInt(events.length + 1),
              eventId: event.eventId,
              idempotencyKey: command.idempotencyKey,
              kind: event.kind,
              payload: event.payload,
              payloadSha256: `sha256:${'0'.repeat(64)}`,
            });
          return {} as never;
        },
      },
      delivery: {
        start: async () => undefined,
        stop: async () => undefined,
        ensureQueue: async () => undefined,
        work: async (queue, handler) => {
          handlers.set(queue, handler);
          return queue;
        },
      },
      hosts: { connect: async () => ({}) },
      workspaces: {
        acquire: async () => ({ workspaceRef: 'network-workspace' }),
        resolve: async () => ({
          cwd: '/network-workspace',
          tempDirectory: '/network-workspace/.tmp',
        }),
        release,
      },
      resolveWorkflow: async () => ({
        sourceDigest: prepared.command.sourceDigest,
        definition: defineWorkflow({
          id: 'network-workflow',
          run: async () => {
            await agent({
              label: 'Default network',
              model: 'gpt-5.6-luna',
              reasoning: 'low',
              prompt: 'Inspect.',
            });
            return agent({
              label: 'Denied network',
              model: 'gpt-5.6-luna',
              reasoning: 'low',
              networkAccess: false,
              prompt: 'Inspect.',
            } as never);
          },
        }),
      }),
      createExecutor: () => ({
        async executeAgent(request) {
          requests.push(request as unknown as Record<string, unknown>);
          return {
            threadId: `thread-${requests.length}`,
            finalResponse: 'done',
            usage: null,
          };
        },
        close,
      }),
    });
    await service.start();
    try {
      const execute = handlers.get('workflow-execution');
      if (!execute) throw new Error('MISSING_WORKFLOW_HANDLER');
      await execute({ runId: prepared.runId, command: prepared.command });
      expect(requests).toEqual([
        expect.objectContaining({
          networkAccess: true,
          node: expect.objectContaining({ networkAccess: true }),
        }),
        expect.objectContaining({
          networkAccess: false,
          node: expect.objectContaining({ networkAccess: false }),
        }),
      ]);
      expect(
        events
          .filter((event) => event.kind === 'node.frozen')
          .map(
            (event) =>
              (event.payload.node as { networkAccess?: unknown }).networkAccess,
          ),
      ).toEqual([true, false]);
    } finally {
      await service.stop();
    }
    expect(close).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
  });

  function setup() {
    const prepared = prepareWorkflowRun({
      workflowRef: 'failure.check',
      sourceDigest: `sha256:${'a'.repeat(64)}`,
      input: {},
      hostId: 'controlled',
      workspace: {
        repositoryId: 'fixture',
        baseRevision: 'b'.repeat(40),
        assignmentId: 'failure-check',
      },
      runtimeProfile: {
        model: 'gpt-5.6-luna',
        reasoningEffort: 'low',
        sandbox: 'readOnly',
        approvalPolicy: 'never',
      },
      idempotencyKey: 'failure-check',
    });
    const handlers = new Map<
      string,
      (data: Readonly<Record<string, unknown>>) => Promise<void>
    >();
    const events: Array<{ kind: string; payload: Record<string, unknown> }> =
      [];
    const keys = new Set<string>();
    let watchSignal: AbortSignal | undefined;
    const release = vi.fn(async () => undefined);
    const service = daemon.createWorkflowExecutionDaemon({
      store: {
        events: async () => events as never,
        execute: async (command) => {
          if (!keys.has(command.idempotencyKey)) {
            keys.add(command.idempotencyKey);
            events.push(...command.events);
          }
          return {} as never;
        },
        async *subscribe(_stream, _cursor, signal) {
          if (!signal) throw Error('MISSING_CANCELLATION_SIGNAL');
          watchSignal = signal;
          if (!signal.aborted)
            await new Promise<void>((resolve) =>
              signal.addEventListener('abort', () => resolve(), { once: true }),
            );
          yield* [];
        },
      },
      delivery: {
        start: async () => undefined,
        stop: async () => undefined,
        ensureQueue: async () => undefined,
        work: async (queue, handler) => {
          handlers.set(queue, handler);
          return queue;
        },
      },
      workspaces: {
        acquire: async () => {
          throw Error('SYNTHETIC_ACQUIRE_FAILURE');
        },
        resolve: async () => {
          throw Error('UNEXPECTED_RESOLVE');
        },
        release,
      },
      hosts: {
        connect: async () => {
          throw Error('UNEXPECTED_CONNECT');
        },
      },
      resolveWorkflow: async () => {
        throw Error('UNEXPECTED_SOURCE');
      },
      createExecutor: () => {
        throw Error('UNEXPECTED_EXECUTOR');
      },
    });
    return {
      service,
      handlers,
      events,
      release,
      job: { runId: prepared.runId, command: prepared.command },
      signal: () => watchSignal,
    };
  }

  it('SETUP-CLEANUP aborts the cancellation subscription when acquisition fails and leaves retry to delivery', async () => {
    const f = setup();
    await f.service.start();
    try {
      const execute = f.handlers.get('workflow-execution');
      if (!execute) throw Error('MISSING_WORKFLOW_HANDLER');
      await expect(execute(f.job)).rejects.toThrow('SYNTHETIC_ACQUIRE_FAILURE');
      expect(f.signal()?.aborted).toBe(true);
      expect(f.release).not.toHaveBeenCalled();
      expect(f.events.map(({ kind }) => kind)).toEqual(['workflow.execution.attempted', 'workflow.execution.error']);
    } finally {
      await f.service.stop();
    }
  });

  it('DELIVERY-EXHAUSTED projects one terminal failure, rejects wrong identity and preserves terminal cancellation', async () => {
    const f = setup();
    await f.service.start();
    try {
      const exhausted = f.handlers.get('workflow-execution-dead');
      expect(exhausted, 'dead-letter consumer must be registered').toBeTypeOf(
        'function',
      );
      if (!exhausted) throw Error('MISSING_DEAD_LETTER_HANDLER');
      await expect(exhausted({ ...f.job, runId: 'wrong' })).rejects.toThrow(
        'WORKFLOW_JOB_INVALID',
      );
      expect(f.events).toEqual([]);
      await exhausted(f.job);
      await exhausted(f.job);
      expect(f.events).toEqual([
        {
          kind: 'workflow.failed',
          payload: { runId: f.job.runId, diagnostic: 'delivery-exhausted' },
          eventId: expect.any(String),
        },
      ]);
      f.events.splice(0, f.events.length, {
        kind: 'workflow.cancelled',
        payload: {},
      });
      await exhausted(f.job);
      expect(f.events).toHaveLength(1);
      expect(f.events[0].kind).toBe('workflow.cancelled');
    } finally {
      await f.service.stop();
    }
  });
});

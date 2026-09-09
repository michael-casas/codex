import { describe, expect, it, vi } from 'vitest';
import { agent, defineWorkflow } from '@codex/workflows';
import type { ControlEvent } from '@codex/process';
import {
  createWorkflowExecutionDaemon,
  type WorkflowExecutionDaemonDependencies,
} from '../workflow-execution-daemon.js';

const validOutput = { answer: 'RECOVERED_PAYLOAD', count: 0 };
const unavailableText =
  'Validated result display unavailable: item provenance could not be verified.';
function fixture(
  options: {
    invalidSchema?: boolean;
    phase?: 'commentary' | 'final_answer';
    failResultWrite?: boolean;
    storeError?: Error;
  } = {},
) {
  const events: ControlEvent[] = [];
  const jobs: Readonly<Record<string, unknown>>[] = [];
  const commands = new Set<string>();
  let handler:
    | ((data: Readonly<Record<string, unknown>>) => Promise<void>)
    | undefined;
  let closed = 0,
    released = 0,
    failedWrites = 0,
    executions = 0;
  const service = createWorkflowExecutionDaemon({
    store: {
      async execute(command) {
        const resultWrite = command.events.some(
          (event) =>
            event.kind === 'workflow.visibility.observed' &&
            (event.payload.observation as { kind?: string } | undefined)
              ?.kind === 'item.result',
        );
        if (options.failResultWrite && resultWrite) {
          failedWrites++;
          throw options.storeError ?? Error('SYNTHETIC_STORE_FAILURE');
        }
        const replayed = commands.has(command.idempotencyKey);
        if (!replayed) {
          commands.add(command.idempotencyKey);
          for (const event of command.events)
            events.push({
              ...event,
              streamId: command.streamId,
              sequence: BigInt(events.length + 1),
              idempotencyKey: command.idempotencyKey,
              payloadSha256: `sha256:${'0'.repeat(64)}`,
            });
          if (command.delivery) jobs.push(command.delivery.data);
        }
        return {
          commandId: command.commandId,
          cursor: String(events.length),
          eventCount: command.events.length,
          replaySha256: `sha256:${'0'.repeat(64)}` as const,
          replayed,
        };
      },
      async events(streamId, afterCursor) {
        return events.filter(
          (event) =>
            event.streamId === streamId && event.sequence > BigInt(afterCursor),
        );
      },
    },
    delivery: {
      start: async () => undefined,
      stop: async () => undefined,
      ensureQueue: async () => undefined,
      async work(_queue, callback) {
        handler = callback;
        return 'synthetic-worker';
      },
    },
    hosts: { connect: async () => ({}) },
    workspaces: {
      acquire: async () => ({ workspaceRef: 'workspace:' + 'c'.repeat(64) }),
      resolve: async () => ({
        cwd: '/fixture',
        tempDirectory: '/fixture/.codex-workspace-tmp',
      }),
      release: async () => {
        released++;
      },
    },
    async resolveWorkflow() {
      return {
        sourceDigest: `sha256:${'a'.repeat(64)}` as const,
        definition: defineWorkflow({
          id: 'recovery-check',
          run: () =>
            agent({
              label: 'Recovered',
              model: 'gpt-5.6-luna',
              reasoning: 'low',
              prompt: 'Synthetic recovery only',
              outputSchema: {
                type: 'object',
                properties: {
                  answer: { type: 'string' },
                  count: { type: 'integer' },
                },
                required: ['answer', 'count'],
                additionalProperties: false,
              },
            }),
        }),
      };
    },
    createExecutor({
      onObservation,
    }: Parameters<WorkflowExecutionDaemonDependencies['createExecutor']>[0]) {
      return {
        async executeAgent(request) {
          executions++;
          await request.onRuntimeEvent({
            type: 'turn.started',
            nodeId: request.node.id,
            threadId: 'thread-a',
            turnId: 'turn-a',
          });
          if (options.phase)
            await onObservation({
              nodeId: request.node.id,
              threadId: 'thread-a',
              turnId: 'turn-a',
              itemId: 'item-a',
              kind: 'item.completed',
              item: {
                threadId: 'thread-a',
                turnId: 'turn-a',
                itemId: 'item-a',
                itemType: 'agentMessage',
                operation: 'replace',
                messagePhase: options.phase,
                body:
                  options.phase === 'commentary'
                    ? 'Commentary only'
                    : JSON.stringify(validOutput),
              },
            });
          return {
            threadId: 'thread-a',
            finalResponse: JSON.stringify(
              options.invalidSchema ? { answer: 5, count: 0 } : validOutput,
            ),
            usage: null,
          };
        },
        async close() {
          closed++;
        },
      };
    },
  });
  return {
    service,
    events,
    get failedWrites() {
      return failedWrites;
    },
    async execute() {
      await service.start();
      const accepted = await service.runWorkflow({
        workflowRef: 'trusted.recovery',
        sourceDigest: `sha256:${'a'.repeat(64)}`,
        input: {},
        hostId: 'synthetic',
        workspace: {
          repositoryId: 'fixture',
          baseRevision: 'b'.repeat(40),
          assignmentId: 'recovery-check',
        },
        runtimeProfile: {
          model: 'gpt-5.6-luna',
          reasoningEffort: 'low',
          sandbox: 'readOnly',
          approvalPolicy: 'never',
        },
        idempotencyKey: 'recovery-check',
      });
      expect(jobs).toHaveLength(1);
      if (!handler || !jobs[0]) throw Error('SYNTHETIC_WORKER_NOT_REGISTERED');
      try {
        await handler(jobs[0]);
      } finally {
        expect(executions).toBe(1);
        expect(closed).toBe(1);
        expect(released).toBe(1);
      }
      return service.readWorkflow(accepted.runId);
    },
  };
}
function observations(events: readonly ControlEvent[]) {
  return events
    .filter((event) => event.kind === 'workflow.visibility.observed')
    .map((event) => event.payload.observation as Record<string, unknown>);
}

// === L1: IN-PROCESS INTEGRATION TESTS ===
describe('[L1:INTEGRATION] recovery output and display independence', () => {
  it.each([undefined, 'commentary' as const])(
    'R2-RECOVERY-DISPLAY-UNAVAILABLE preserves validated output with %s provenance',
    async (phase) => {
      const f = fixture({ phase });
      try {
        expect(await f.execute()).toMatchObject({
          state: 'completed',
          result: validOutput,
        });
        const visible = observations(f.events);
        const unavailable = visible.filter(
          (event) => event.kind === 'result.unavailable',
        );
        expect(unavailable).toHaveLength(1);
        expect(unavailable[0]).toMatchObject({
          kind: 'result.unavailable',
          detail: { type: 'message', body: unavailableText },
        });
        expect(unavailable[0]).not.toHaveProperty('item');
        expect(unavailable[0]).not.toHaveProperty('fields');
        expect(unavailable[0]).not.toHaveProperty('itemId');
        expect(JSON.stringify(unavailable)).not.toContain('RECOVERED_PAYLOAD');
        expect(visible.some((event) => event.kind === 'item.result')).toBe(
          false,
        );
      } finally {
        await f.service.stop();
      }
    },
  );

  it('R2-RECOVERY-SCHEMA-FAILURE preserves genuine validation failure without a validated display event', async () => {
    const f = fixture({ invalidSchema: true });
    try {
      expect(await f.execute()).toMatchObject({ state: 'failed' });
      expect(
        f.events.some((event) => event.kind === 'workflow.completed'),
      ).toBe(false);
      expect(
        observations(f.events).some((event) =>
          ['item.result', 'result.unavailable'].includes(String(event.kind)),
        ),
      ).toBe(false);
    } finally {
      await f.service.stop();
    }
  });

  it('R2-RECOVERY-STORE-FAILURE does not turn a genuine display persistence error into success', async () => {
    const f = fixture({ phase: 'final_answer', failResultWrite: true });
    try {
      await expect(f.execute()).rejects.toThrow('SYNTHETIC_STORE_FAILURE');
      expect(f.failedWrites).toBe(1);
      expect(
        f.events.some((event) => event.kind === 'workflow.completed'),
      ).toBe(false);
      expect(
        observations(f.events).some(
          (event) => event.kind === 'result.unavailable',
        ),
      ).toBe(false);
    } finally {
      await f.service.stop();
    }
  });
});

// === L1: IN-PROCESS INTEGRATION TESTS ===
it('[L1:INTEGRATION] R5-L1-PRIMARY retains observation storage failure before cleanup without a duplicate execution', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const error = Object.assign(Error('private credentials'), { code: '23514' });
  const f = fixture({
    phase: 'final_answer',
    failResultWrite: true,
    storeError: error,
  });
  try {
    await expect(f.execute()).rejects.toBe(error);
    expect(
      log.mock.calls.map(([line]) => JSON.parse(String(line))),
    ).toContainEqual(
      expect.objectContaining({
        event: 'workflow.observation.failure',
        causeCode: '23514',
        errorClass: 'Error',
        stage: 'persist',
      }),
    );
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/private|credentials/);
    expect(f.failedWrites).toBe(1);
  } finally {
    await f.service.stop();
    log.mockRestore();
  }
});

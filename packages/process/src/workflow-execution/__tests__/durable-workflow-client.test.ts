import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';

import * as processApi from '../../index.js';

type Event = {
  streamId: string;
  sequence: bigint;
  eventId: string;
  idempotencyKey: string;
  kind: string;
  payload: Record<string, unknown>;
  payloadSha256: `sha256:${string}`;
};

type Command = {
  commandId: string;
  streamId: string;
  idempotencyKey: string;
  kind: string;
  payload: Record<string, unknown>;
  events: Array<{
    eventId: string;
    kind: string;
    payload: Record<string, unknown>;
  }>;
  delivery?: { data: Record<string, unknown> };
};

function fixture() {
  const events: Event[] = [];
  const commands = new Map<string, string>();
  const jobs: Record<string, unknown>[] = [];
  const store = {
    async execute(command: Command) {
      const fingerprint = JSON.stringify(command.payload);
      const previous = commands.get(command.idempotencyKey);
      if (previous && previous !== fingerprint)
        throw new Error('CONTROL_IDEMPOTENCY_CONFLICT');
      if (!previous) {
        commands.set(command.idempotencyKey, fingerprint);
        for (const event of command.events) {
          events.push({
            streamId: command.streamId,
            sequence: BigInt(events.length + 1),
            eventId: event.eventId,
            idempotencyKey: command.idempotencyKey,
            kind: event.kind,
            payload: event.payload,
            payloadSha256: `sha256:${'0'.repeat(64)}`,
          });
        }
        if (command.delivery) jobs.push(command.delivery.data);
      }
      return {
        commandId: command.commandId,
        cursor: events.at(-1)?.sequence.toString() ?? '0',
        eventCount: events.length,
        replaySha256: `sha256:${'0'.repeat(64)}`,
        replayed: Boolean(previous),
      };
    },
    async events(streamId: string) {
      return events.filter((event) => event.streamId === streamId);
    },
  };
  const prepare = (value: unknown) => {
    const command = value as { idempotencyKey: string; input?: unknown };
    return {
      runId: `workflow_${'a'.repeat(64)}`,
      streamId: `workflow:${'a'.repeat(64)}`,
      requestFingerprint: `sha256:${createHash('sha256')
        .update(JSON.stringify(command.input ?? null))
        .digest('hex')}`,
      command: value,
    };
  };
  const factory = (processApi as Record<string, unknown>)
    .createDurableWorkflowClient;
  expect(
    factory,
    'CAS-07.R1 package-owned durable workflow client is absent',
  ).toBeTypeOf('function');
  if (typeof factory !== 'function') throw new Error('CLIENT_NOT_IMPLEMENTED');
  const client = factory({ store, prepare }) as {
    runWorkflow(command: unknown): Promise<Record<string, unknown>>;
    run_workflow(command: unknown): Promise<Record<string, unknown>>;
    readWorkflow(
      runId: string,
      cursor?: string,
    ): Promise<Record<string, unknown>>;
    cancelWorkflow(runId: string): Promise<Record<string, unknown>>;
  };
  return { client, events, jobs };
}

describe('[L1:UNIT] durable workflow command client', () => {
  it('returns one stable handle for exact replay and rejects conflicting reuse', async () => {
    const { client, jobs } = fixture();
    const command = { idempotencyKey: 'cas07-r1-run', input: { value: 1 } };
    const first = await client.runWorkflow(command);
    expect(await client.run_workflow(command)).toEqual(first);
    expect(await client.runWorkflow(command)).toEqual(first);
    expect(jobs).toHaveLength(1);
    await expect(
      client.runWorkflow({ ...command, input: { value: 2 } }),
    ).rejects.toThrow(/CONTROL_IDEMPOTENCY_CONFLICT/);
    expect(jobs).toHaveLength(1);
  });

  it('shapes terminal result observation from one run id and cursor', async () => {
    const { client, events } = fixture();
    const handle = await client.runWorkflow({ idempotencyKey: 'observe' });
    const runId = String(handle.runId);
    const streamId = `workflow:${runId}`;
    events.push({
      streamId,
      sequence: BigInt(events.length + 1),
      eventId: 'terminal',
      idempotencyKey: 'terminal',
      kind: 'workflow.completed',
      payload: {
        result: { answer: 42 },
        nodes: [{ id: 'node-1', outcome: 'completed' }],
        artifacts: [
          { name: 'result.json', digest: `sha256:${'b'.repeat(64)}` },
        ],
      },
      payloadSha256: `sha256:${'0'.repeat(64)}`,
    });
    const observed = await client.readWorkflow(runId, '0');
    expect(observed).toMatchObject({
      runId,
      state: 'completed',
      changed: true,
      result: { answer: 42 },
      nodes: [{ id: 'node-1', outcome: 'completed' }],
      artifacts: [{ name: 'result.json' }],
    });
    expect(
      await client.readWorkflow(runId, String(observed.cursor)),
    ).toMatchObject({
      changed: false,
      cursor: observed.cursor,
    });
  });

  it('requests cancellation once and rejects invalid run identity or cursor', async () => {
    const { client, events } = fixture();
    const handle = await client.runWorkflow({ idempotencyKey: 'cancel' });
    const runId = String(handle.runId);
    expect(await client.cancelWorkflow(runId)).toMatchObject({
      runId,
      cancellationRequested: true,
    });
    expect(await client.cancelWorkflow(runId)).toMatchObject({
      cancellationRequested: true,
    });
    expect(
      events.filter(({ kind }) => kind === 'workflow.cancel.requested'),
    ).toHaveLength(1);
    await expect(client.readWorkflow('invalid', '0')).rejects.toThrow(
      /WORKFLOW_RUN_ID_INVALID/,
    );
    await expect(client.readWorkflow(runId, '-1')).rejects.toThrow(
      /WORKFLOW_CURSOR_INVALID/,
    );
  });
});

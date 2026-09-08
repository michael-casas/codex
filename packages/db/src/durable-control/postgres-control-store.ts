import { createHash } from 'node:crypto';

import { Client } from 'pg';

import { reconcileControlEvents, type ControlEvent } from '@codex/process';

export interface ControlEventInput {
  readonly eventId: string;
  readonly kind: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface ControlArtifactInput {
  readonly artifactId: string;
  readonly kind: string;
  readonly mediaType: string;
  readonly content: Uint8Array;
}

export interface ControlDeliveryInput {
  readonly queue: string;
  readonly data: Readonly<Record<string, unknown>>;
  readonly retryLimit: number;
  readonly retryDelaySeconds: number;
  readonly retryBackoff: boolean;
  readonly expireInSeconds: number;
  readonly deadLetter?: string;
}

export interface ExecuteControlCommand {
  readonly commandId: string;
  readonly streamId: string;
  readonly idempotencyKey: string;
  readonly kind: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly events: readonly ControlEventInput[];
  readonly artifacts?: readonly ControlArtifactInput[];
  readonly delivery?: ControlDeliveryInput;
}

export interface ControlCommandResult {
  readonly commandId: string;
  readonly cursor: string;
  readonly eventCount: number;
  readonly replaySha256: `sha256:${string}`;
  readonly deliveryJobId?: string;
  readonly replayed: boolean;
}

export interface TransactionDatabase {
  executeSql(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
}

export interface TransactionalDeliveryWriter {
  enqueue(
    database: TransactionDatabase,
    commandId: string,
    delivery: ControlDeliveryInput,
  ): Promise<string>;
}

export class PostgresControlStore {
  private started = false;

  constructor(
    readonly connectionString: string,
    readonly delivery?: TransactionalDeliveryWriter,
  ) {}

  async start(): Promise<void> {
    if (this.started) return;
    const client = new Client({ connectionString: this.connectionString });
    await client.connect();
    try {
      await client.query('SELECT 1');
      this.started = true;
    } finally {
      await client.end();
    }
  }

  async stop(): Promise<void> {
    this.started = false;
  }

  async execute(command: ExecuteControlCommand): Promise<ControlCommandResult> {
    if (
      command.delivery &&
      !command.events.some(({ kind }) => kind === 'delivery.requested')
    ) {
      throw new Error('CONTROL_DELIVERY_UNAUTHORIZED');
    }
    const client = new Client({ connectionString: this.connectionString });
    await client.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{
        command_id: string;
        cursor: string;
        event_count: number;
        replay_sha256: `sha256:${string}`;
        replayed: boolean;
      }>(
        'SELECT * FROM process.append_control_command($1::uuid,$2::text,$3::text,$4::text,$5::jsonb,$6::jsonb)',
        [
          command.commandId,
          command.streamId,
          command.idempotencyKey,
          command.kind,
          command.payload,
          JSON.stringify(command.events),
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error('CONTROL_COMMAND_RESULT_INVALID');

      for (const artifact of command.artifacts ?? []) {
        const sha256 = `sha256:${createHash('sha256').update(artifact.content).digest('hex')}`;
        await client.query(
          'SELECT process.register_control_artifact($1::uuid,$2::uuid,$3::text,$4::text,$5::text,$6::bytea,$7::text)',
          [
            artifact.artifactId,
            command.commandId,
            command.streamId,
            artifact.kind,
            artifact.mediaType,
            artifact.content,
            sha256,
          ],
        );
      }

      let deliveryJobId: string | undefined;
      if (!row.replayed && command.delivery) {
        if (!this.delivery) throw new Error('CONTROL_DELIVERY_WRITER_MISSING');
        deliveryJobId = await this.delivery.enqueue(
          { executeSql: async (text, values) => client.query(text, values) },
          command.commandId,
          command.delivery,
        );
      }
      await client.query('COMMIT');
      return {
        commandId: row.command_id,
        cursor: String(row.cursor),
        eventCount: Number(row.event_count),
        replaySha256: row.replay_sha256,
        ...(deliveryJobId ? { deliveryJobId } : {}),
        replayed: row.replayed,
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (error instanceof Error && error.message.includes('CONTROL_'))
        throw error;
      throw error;
    } finally {
      await client.end();
    }
  }

  async events(
    streamId: string,
    afterCursor: string,
  ): Promise<readonly ControlEvent[]> {
    if (!/^(0|[1-9]\d*)$/.test(afterCursor))
      throw new Error('CONTROL_CURSOR_INVALID');
    const client = new Client({ connectionString: this.connectionString });
    await client.connect();
    try {
      const result = await client.query<{
        stream_id: string;
        sequence: string;
        event_id: string;
        idempotency_key: string;
        kind: string;
        payload: Record<string, unknown>;
        payload_sha256: `sha256:${string}`;
      }>('SELECT * FROM process.read_control_events($1::text,$2::bigint)', [
        streamId,
        afterCursor,
      ]);
      return result.rows.map((row) => ({
        streamId: row.stream_id,
        sequence: BigInt(row.sequence),
        eventId: row.event_id,
        idempotencyKey: row.idempotency_key,
        kind: row.kind,
        payload: row.payload,
        payloadSha256: row.payload_sha256,
      }));
    } finally {
      await client.end();
    }
  }

  async *subscribe(
    streamId: string,
    afterCursor: string,
    signal?: AbortSignal,
  ): AsyncIterable<ControlEvent> {
    const initial = await this.events(streamId, afterCursor);
    const listener = new Client({ connectionString: this.connectionString });
    await listener.connect();
    let pending = false;
    let wake: (() => void) | undefined;
    const notify = (message: { payload?: string }) => {
      try {
        const payload = JSON.parse(message.payload ?? '{}') as {
          streamId?: string;
        };
        if (payload.streamId !== streamId) return;
        pending = true;
        wake?.();
      } catch {
        // Ignore malformed payloads from outside the owned channel contract.
      }
    };
    listener.on('notification', notify);
    await listener.query('LISTEN process_control_event');
    let current = afterCursor;
    try {
      const afterListen = await this.events(streamId, current);
      for (const event of reconcileControlEvents(current, [
        initial,
        afterListen,
      ])) {
        current = event.sequence.toString();
        yield event;
      }
      while (!signal?.aborted) {
        if (!pending) {
          await new Promise<void>((resolve) => {
            const abort = () => resolve();
            wake = () => {
              signal?.removeEventListener('abort', abort);
              resolve();
            };
            signal?.addEventListener('abort', abort, { once: true });
          });
        }
        wake = undefined;
        if (signal?.aborted) break;
        pending = false;
        const fresh = await this.events(streamId, current);
        for (const event of reconcileControlEvents(current, [fresh])) {
          current = event.sequence.toString();
          yield event;
        }
      }
    } finally {
      listener.removeListener('notification', notify);
      await listener
        .query('UNLISTEN process_control_event')
        .catch(() => undefined);
      await listener.end();
    }
  }

  async advanceCursor(
    consumerId: string,
    streamId: string,
    value: string,
  ): Promise<string> {
    if (!/^(0|[1-9]\d*)$/.test(value))
      throw new Error('CONTROL_CURSOR_INVALID');
    const client = new Client({ connectionString: this.connectionString });
    await client.connect();
    try {
      const result = await client.query<{ cursor: string }>(
        'SELECT process.advance_control_cursor($1::text,$2::text,$3::bigint) AS cursor',
        [consumerId, streamId, value],
      );
      const row = result.rows[0];
      if (!row) throw new Error('CONTROL_CURSOR_RESULT_INVALID');
      return String(row.cursor);
    } finally {
      await client.end();
    }
  }
}

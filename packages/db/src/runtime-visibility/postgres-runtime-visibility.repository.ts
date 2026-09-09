import { Client } from 'pg';

import {
  RuntimeVisibilityError,
  runtimeVisibilitySha256,
  shapeVisibilityResult,
  type NormalizedVisibilityEvent,
  type RuntimeVisibilityRepository,
  type VisibilityQuery,
  type VisibilityResult,
  type VisibilitySummary,
  type WaitVisibilityQuery,
  type VisibleItem,
  reduceVisibleItem,
  VISIBILITY_EVALUATION_LIMITS,
} from '@codex/process';

function summaryId(event: NormalizedVisibilityEvent): string {
  return event.source === 'workflow'
    ? (event.workflowId ?? event.eventId)
    : (event.agentId ?? event.projectId ?? event.eventId);
}

function selection(query: VisibilityQuery): VisibilityQuery {
  return {
    ...(query.selectedAgentId
      ? { selectedAgentId: query.selectedAgentId }
      : {}),
    ...(query.selectionId ? { selectionId: query.selectionId } : {}),
  };
}

export class PostgresRuntimeVisibilityRepository
  implements RuntimeVisibilityRepository
{
  constructor(readonly connectionString: string) {}

  async sourcePage(afterCursor: string) {
    const client = new Client({ connectionString: this.connectionString });
    await client.connect();
    try {
      const rows = await client.query<{
        sequence: string;
        event_id: string;
        stream_id: string;
        kind: string;
        payload: Record<string, unknown>;
        occurred_at: Date;
      }>(
        'SELECT * FROM process.read_visibility_source_events($1::bigint,1000)',
        [afterCursor],
      );
      return rows.rows.map((row) => ({
        sequence: String(row.sequence),
        eventId: row.event_id,
        streamId: row.stream_id,
        kind: row.kind,
        payload: row.payload,
        occurredAt: row.occurred_at.toISOString(),
      }));
    } finally {
      await client.end();
    }
  }

  async delegationPage(afterId?: string, onlyId?: string) {
    const client = new Client({ connectionString: this.connectionString });
    await client.connect();
    try {
      const rows = await client.query<{
        delegation_id: string;
        agent_id: string;
        thread_id: string | null;
        state: string;
        title: string;
        updated_at: Date;
      }>(
        'SELECT * FROM process.read_visibility_delegations($1::uuid,1000,$2::uuid)',
        [afterId ?? null, onlyId ?? null],
      );
      return rows.rows.map((row) => ({
        delegationId: row.delegation_id,
        agentId: row.agent_id,
        threadId: row.thread_id,
        status: row.state,
        title: row.title,
        occurredAt: row.updated_at.toISOString(),
      }));
    } finally {
      await client.end();
    }
  }

  async listenSource(
    onSequence: (sequence: string) => void,
    onError: (error: unknown) => void,
  ) {
    const client = new Client({ connectionString: this.connectionString });
    let closing = false;
    client.on('error', (error: Error) => {
      if (!closing)
        onError(
          error.message === 'Connection terminated unexpectedly'
            ? new RuntimeVisibilityError(
                'VISIBILITY_SOURCE_DISCONNECTED',
                'Visibility source listener disconnected.',
              )
            : error,
        );
    });
    client.on('end', () => {
      if (!closing)
        onError(
          new RuntimeVisibilityError(
            'VISIBILITY_SOURCE_DISCONNECTED',
            'Visibility source listener disconnected.',
          ),
        );
    });
    client.on('notification', (notification) => {
      if (notification.channel !== 'process_control_event') return;
      try {
        const value: unknown = JSON.parse(notification.payload ?? '{}');
        if (
          typeof value === 'object' &&
          value !== null &&
          'sequence' in value &&
          /^(0|[1-9]\d*)$/.test(String(value.sequence))
        )
          onSequence(String(value.sequence));
      } catch (error) {
        onError(error);
      }
    });
    try {
      await client.connect();
      await client.query('LISTEN process_control_event');
    } catch (error) {
      closing = true;
      await client.end();
      throw error;
    }
    return async () => {
      closing = true;
      await client.end();
    };
  }

  async ingest(event: NormalizedVisibilityEvent): Promise<string> {
    const client = new Client({ connectionString: this.connectionString });
    await client.connect();
    try {
      if (event.item) {
        await client.query('BEGIN');
        const appended = await client.query<{ cursor: string }>(
          'SELECT process.append_visibility_item_event($1::jsonb,$2::text,$3::text) AS cursor',
          [event, runtimeVisibilitySha256(event), summaryId(event)],
        );
        const cursor = String(appended.rows[0]?.cursor ?? '');
        if (!cursor) throw Error('VISIBILITY_RESULT_INVALID');
        // append_runtime_visibility holds its cursor row lock until this transaction commits.
        const prior = await client.query<{ snapshot: VisibleItem }>(
          'SELECT snapshot FROM process.runtime_visibility_item WHERE item_id=$1',
          [event.item.id],
        );
        const next = reduceVisibleItem(prior.rows[0]?.snapshot, event, cursor);
        if (next.revision === cursor)
          await client.query(
            'SELECT process.store_visible_item($1::bigint,$2::jsonb)',
            [cursor, next],
          );
        await client.query('COMMIT');
        return cursor;
      }
      const result = await client.query<{ cursor: string }>(
        'SELECT process.append_runtime_visibility($1::jsonb,$2::text,$3::text) AS cursor',
        [event, runtimeVisibilitySha256(event), summaryId(event)],
      );
      const row = result.rows[0];
      if (!row) throw new Error('VISIBILITY_RESULT_INVALID');
      return String(row.cursor);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('VISIBILITY_EVENT_CONFLICT')
      ) {
        if (event.item) await client.query('ROLLBACK').catch(() => undefined);
        throw new RuntimeVisibilityError(
          'VISIBILITY_EVENT_CONFLICT',
          'A conflicting visibility event reused an event identity.',
        );
      }
      if (event.item) await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      await client.end();
    }
  }

  private async read(
    query: VisibilityQuery,
    afterCursor?: string,
    client?: Client,
  ): Promise<VisibilityResult> {
    const owned =
      client ?? new Client({ connectionString: this.connectionString });
    if (!client) await owned.connect();
    try {
      const hasItems = Boolean(
        (
          await owned.query<{ relation: string | null }>(
            "SELECT to_regclass('process.runtime_visibility_item')::text AS relation",
          )
        ).rows[0]?.relation,
      );
      const cursorResult = await owned.query<{ cursor: string }>(
        'SELECT cursor::text FROM process.runtime_visibility_state WHERE singleton',
      );
      const cursor = String(cursorResult.rows[0]?.cursor ?? '0');
      if (afterCursor !== undefined && BigInt(cursor) <= BigInt(afterCursor)) {
        return { cursor, changed: false, ...selection(query) };
      }
      const summaries = await owned.query<{ summary: VisibilitySummary }>(
        'SELECT summary FROM process.runtime_visibility_summary ORDER BY cursor, source, summary_id LIMIT 501',
      );
      const summaryValues = summaries.rows.map(({ summary }) => summary);
      let details: VisibilityResult['details'];
      if (query.selectedAgentId) {
        const rows = await owned.query<{
          event: NormalizedVisibilityEvent;
          truncated: boolean;
        }>(
          `SELECT event || jsonb_build_object('detail', detail) AS event,
             EXISTS (
               SELECT 1 FROM process.runtime_visibility_event prior
               WHERE prior.agent_id = $1 AND prior.had_detail AND prior.detail IS NULL ${hasItems ? 'AND prior.item_payload IS NULL' : ''}
             ) AS truncated
           FROM process.runtime_visibility_event
           WHERE agent_id = $1 AND detail IS NOT NULL AND sequence > $2::bigint
           ORDER BY sequence
           LIMIT 101`,
          [query.selectedAgentId, afterCursor ?? '0'],
        );
        details = {
          agentId: query.selectedAgentId,
          truncated:
            rows.rows.length > 100 ||
            rows.rows.some(({ truncated }) => truncated),
          events: rows.rows.slice(0, 100).map(({ event }) => event),
        };
        if (hasItems) {
          const rows = await owned.query<{ snapshot: VisibleItem }>(
            'SELECT snapshot FROM process.runtime_visibility_item WHERE agent_id=$1 ORDER BY revision DESC LIMIT 101',
            [query.selectedAgentId],
          );
          const items: VisibleItem[] = [];
          let bytes = 0;
          let truncated = false;
          for (const { snapshot } of rows.rows) {
            const cost =
              Buffer.byteLength(snapshot.body) +
              (snapshot.fields ?? []).reduce(
                (sum, field) =>
                  sum +
                  Buffer.byteLength(field.name) +
                  Buffer.byteLength(String(field.value)),
                0,
              );
            if (
              items.length >= VISIBILITY_EVALUATION_LIMITS.logicalItems ||
              bytes + cost > VISIBILITY_EVALUATION_LIMITS.aggregateBytes
            ) {
              truncated = true;
              break;
            }
            bytes += cost;
            items.push(snapshot);
          }
          items.sort((a, b) =>
            BigInt(a.firstRevision) < BigInt(b.firstRevision)
              ? -1
              : BigInt(a.firstRevision) > BigInt(b.firstRevision)
                ? 1
                : 0,
          );
          details = {
            ...details,
            items,
            truncated: truncated || details.truncated,
          };
        }
      }
      return {
        ...shapeVisibilityResult({
          cursor,
          changed: true,
          summaries: summaryValues.slice(0, 500),
          summariesTruncated: summaryValues.length > 500,
          ...selection(query),
          ...(details ? { details } : {}),
        }),
        ...(hasItems ? { evaluationLimits: VISIBILITY_EVALUATION_LIMITS } : {}),
      };
    } finally {
      if (!client) await owned.end();
    }
  }

  snapshot(query: VisibilityQuery = {}): Promise<VisibilityResult> {
    return this.read(query);
  }

  async wait(
    query: WaitVisibilityQuery,
    signal?: AbortSignal,
  ): Promise<VisibilityResult> {
    const immediate = await this.read(query, query.afterCursor);
    if (immediate.changed || query.waitMs === 0 || signal?.aborted)
      return immediate;

    const listener = new Client({ connectionString: this.connectionString });
    await listener.connect();
    try {
      await listener.query('LISTEN process_runtime_visibility');
      const afterListen = await this.read(query, query.afterCursor, listener);
      if (afterListen.changed || signal?.aborted) return afterListen;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(done, query.waitMs);
        const notification = () => done();
        const abort = () => done();
        function done() {
          clearTimeout(timer);
          listener.removeListener('notification', notification);
          signal?.removeEventListener('abort', abort);
          resolve();
        }
        listener.on('notification', notification);
        signal?.addEventListener('abort', abort, { once: true });
      });
      return await this.read(query, query.afterCursor, listener);
    } finally {
      await listener
        .query('UNLISTEN process_runtime_visibility')
        .catch(() => undefined);
      await listener.end();
    }
  }
}

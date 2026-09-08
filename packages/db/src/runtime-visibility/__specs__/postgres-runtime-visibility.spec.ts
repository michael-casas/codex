import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { Client } from 'pg';
import { describe, expect, it } from 'vitest';

import * as processApi from '@codex/process';
import * as dbApi from '../../index.js';
import { createControlDatabaseFixture } from '../../durable-control/testing/control-database-fixture.js';

const observedAt = '2026-09-02T10:00:00.000Z';

async function fixture() {
  const value = await createControlDatabaseFixture();
  try {
    const migration = await readFile(
      resolve('migrations/process/005_runtime_visibility.sql'),
      'utf8',
    );
    const owner = new Client({ connectionString: value.ownerUrl });
    await owner.connect();
    try {
      await owner.query(migration);
    } finally {
      await owner.end();
    }
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT'))
      throw error;
  }
  return value;
}

function repository(connectionString: string) {
  const Constructor = (dbApi as Record<string, unknown>)[
    'PostgresRuntimeVisibilityRepository'
  ];
  expect(
    Constructor,
    'PostgresRuntimeVisibilityRepository must be exported by @codex/db',
  ).toBeTypeOf('function');
  return typeof Constructor === 'function'
    ? new (Constructor as new (url: string) => {
        ingest(event: unknown): Promise<string>;
        snapshot(query?: unknown): Promise<Record<string, unknown>>;
        wait(query: unknown): Promise<Record<string, unknown>>;
      })(connectionString)
    : undefined;
}

function event(input: Record<string, unknown>): unknown {
  const normalize = (processApi as Record<string, unknown>)[
    'normalizeVisibilityObservation'
  ];
  expect(normalize).toBeTypeOf('function');
  return typeof normalize === 'function' ? normalize(input) : input;
}

// === L2: REAL-BOUNDARY INTEGRATION TESTS ===
describe('[L2:INTEGRATION] PostgreSQL runtime visibility', () => {
  it('CAS08-L2-DURABLE persists all source summaries and reconstructs the same snapshot after repository restart', async () => {
    const database = await fixture();
    try {
      const first = repository(database.daemonUrl);
      if (!first) return;
      for (const input of [
        {
          eventId: 'app-1',
          source: 'app-server',
          kind: 'turn.completed',
          agentId: 'agent-1',
          status: 'completed',
        },
        {
          eventId: 'workflow-1',
          source: 'workflow',
          kind: 'workflow.progress',
          workflowId: 'workflow-1',
          agentId: 'agent-1',
          status: 'running',
          current: 2,
          total: 3,
        },
        {
          eventId: 'delegation-1',
          source: 'delegation',
          kind: 'delegation.status',
          agentId: 'agent-2',
          status: 'running',
        },
        {
          eventId: 'message-1',
          source: 'message',
          kind: 'message.status',
          agentId: 'agent-2',
          status: 'thread-observed',
        },
      ]) {
        await first.ingest(
          event({ ...input, occurredAt: observedAt, projectId: 'project-1' }),
        );
      }
      const selected = await first.snapshot({
        selectedAgentId: 'agent-1',
        selectionId: 'selection-1',
      });
      const restarted = repository(database.daemonUrl);
      expect(restarted).toBeDefined();
      expect(
        await restarted?.snapshot({
          selectedAgentId: 'agent-1',
          selectionId: 'selection-1',
        }),
      ).toEqual(selected);
      expect(
        new Set(
          (selected.summaries as Array<{ source: string }>).map(
            ({ source }) => source,
          ),
        ),
      ).toEqual(new Set(['app-server', 'workflow', 'delegation', 'message']));
    } finally {
      await database.close();
    }
  });

  it('CAS08-L2-CURSOR closes snapshot-listen-requery races and recovers lost notifications with a monotonic cursor', async () => {
    const database = await fixture();
    try {
      const store = repository(database.daemonUrl);
      if (!store) return;
      const firstWait = store.wait({ afterCursor: '0', waitMs: 2_000 });
      const secondWait = store.wait({ afterCursor: '0', waitMs: 2_000 });
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
      const cursor = await store.ingest(
        event({
          eventId: 'cursor-1',
          source: 'workflow',
          kind: 'workflow.progress',
          occurredAt: observedAt,
          workflowId: 'workflow-1',
          status: 'running',
        }),
      );
      const results = await Promise.all([firstWait, secondWait]);
      expect(results).toEqual([
        expect.objectContaining({ cursor, changed: true }),
        expect.objectContaining({ cursor, changed: true }),
      ]);
      expect(await store.wait({ afterCursor: '0', waitMs: 0 })).toMatchObject({
        cursor,
        changed: true,
      });
      expect(await store.wait({ afterCursor: cursor, waitMs: 0 })).toEqual({
        cursor,
        changed: false,
      });
    } finally {
      await database.close();
    }
  });

  it('CAS08-L2-IDEMPOTENCY deduplicates exact observations and rejects conflicting event identity reuse without state change', async () => {
    const database = await fixture();
    try {
      const store = repository(database.daemonUrl);
      if (!store) return;
      const original = event({
        eventId: 'duplicate-1',
        source: 'delegation',
        kind: 'delegation.status',
        occurredAt: observedAt,
        agentId: 'agent-1',
        status: 'running',
      });
      const cursor = await store.ingest(original);
      expect(await store.ingest(original)).toBe(cursor);
      const before = await store.snapshot();
      await expect(
        store.ingest(
          event({
            eventId: 'duplicate-1',
            source: 'delegation',
            kind: 'delegation.status',
            occurredAt: observedAt,
            agentId: 'agent-1',
            status: 'failed',
          }),
        ),
      ).rejects.toMatchObject({ code: 'VISIBILITY_EVENT_CONFLICT' });
      expect(await store.snapshot()).toEqual(before);
    } finally {
      await database.close();
    }
  });

  it('CAS08-L2-FILTER-RETENTION returns details only for the selected agent and caps retained detail rows and bytes', async () => {
    const database = await fixture();
    try {
      const store = repository(database.daemonUrl);
      if (!store) return;
      for (let index = 0; index < 105; index += 1) {
        await store.ingest(
          event({
            eventId: `detail-a-${index}`,
            source: 'app-server',
            kind: 'item.completed',
            occurredAt: observedAt,
            agentId: 'agent-1',
            itemId: `item-a-${index}`,
            status: 'completed',
            detail: { type: 'tool', body: `agent-one-${index}` },
          }),
        );
      }
      await store.ingest(
        event({
          eventId: 'detail-b',
          source: 'app-server',
          kind: 'item.completed',
          occurredAt: observedAt,
          agentId: 'agent-2',
          itemId: 'item-b',
          status: 'completed',
          detail: { type: 'message', body: 'agent-two-private' },
        }),
      );

      const snapshot = await store.snapshot({
        selectedAgentId: 'agent-1',
        selectionId: 'selection-1',
      });
      const details = snapshot.details as {
        agentId: string;
        truncated: boolean;
        events: Array<{ detail: { body: string } }>;
      };
      expect(details.agentId).toBe('agent-1');
      expect(details.events).toHaveLength(100);
      expect(details.truncated).toBe(true);
      expect(JSON.stringify(details)).not.toContain('agent-two-private');
      expect(
        details.events.every(
          ({ detail }) => Buffer.byteLength(detail.body, 'utf8') <= 4_096,
        ),
      ).toBe(true);
    } finally {
      await database.close();
    }
  });

  it('CAS08-L2-RECONNECT-BOUNDS recovers disconnect state and marks a bounded 500-summary window as truncated', async () => {
    const database = await fixture();
    try {
      const store = repository(database.daemonUrl);
      if (!store) return;
      const disconnected = await store.ingest(
        event({
          eventId: 'disconnect-1',
          source: 'app-server',
          kind: 'runtime.disconnected',
          occurredAt: observedAt,
          workflowId: 'workflow-0',
          stepId: 'runtime',
          agentId: 'agent-1',
          status: 'disconnected',
        }),
      );
      await store.ingest(
        event({
          eventId: 'reconnect-1',
          source: 'app-server',
          kind: 'runtime.reconnected',
          occurredAt: observedAt,
          workflowId: 'workflow-0',
          stepId: 'runtime',
          agentId: 'agent-1',
          status: 'running',
        }),
      );
      for (let index = 0; index < 501; index += 1) {
        await store.ingest(
          event({
            eventId: `window-${index}`,
            source: 'workflow',
            kind: 'workflow.progress',
            occurredAt: observedAt,
            workflowId: `workflow-${index + 1}`,
            status: 'running',
          }),
        );
      }

      const started = performance.now();
      const snapshot = await store.snapshot();
      const queryMs = performance.now() - started;
      expect(snapshot.summaries).toHaveLength(500);
      expect(snapshot.summariesTruncated).toBe(true);
      expect(queryMs).toBeLessThan(2_000);
      expect(
        await store.wait({ afterCursor: disconnected, waitMs: 0 }),
      ).toMatchObject({
        changed: true,
        summaries: expect.arrayContaining([
          expect.objectContaining({
            source: 'app-server',
            agentId: 'agent-1',
            status: 'running',
            stateText: 'Running',
          }),
        ]),
      });
    } finally {
      await database.close();
    }
  });
});

// === L2: END-TO-END TESTS ===

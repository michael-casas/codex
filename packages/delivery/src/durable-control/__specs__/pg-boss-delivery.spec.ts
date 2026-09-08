import { Client } from 'pg';
import { PgBoss } from 'pg-boss';
import { describe, expect, it } from 'vitest';

import { createControlDatabaseFixture } from '@codex/db/testing';
import { PostgresControlStore } from '@codex/db';
import { PgBossDeliveryRuntime } from '../pg-boss-delivery.js';

function ensureQueue(runtime: PgBossDeliveryRuntime, name: string) {
  const candidate = (
    runtime as PgBossDeliveryRuntime & {
      ensureQueue?: (queue: string) => Promise<void>;
    }
  ).ensureQueue;
  expect(candidate, 'CAS-05.R1 queue admission is not implemented').toBeTypeOf(
    'function',
  );
  return candidate.call(runtime, name);
}

// === L2: REAL-BOUNDARY INTEGRATION TESTS ===
describe('[L2:INTEGRATION] pg-boss durable delivery', () => {
  it('CAS05-R1 rejects queue admission before start without creating the queue', async () => {
    const fixture = await createControlDatabaseFixture();
    const delivery = new PgBossDeliveryRuntime(
      fixture.daemonUrl,
      fixture.ownerUrl,
    );
    const observer = new PgBoss(fixture.ownerUrl);
    observer.on('error', () => undefined);
    try {
      await observer.start();
      await expect(
        ensureQueue(delivery, 'cas05-r1-not-started'),
      ).rejects.toThrow('DELIVERY_NOT_STARTED');
      await expect(
        observer.getQueue('cas05-r1-not-started'),
      ).resolves.toBeNull();
    } finally {
      await delivery.stop();
      await observer.stop({ graceful: true, close: true, timeout: 5_000 });
      await fixture.close();
    }
  });

  it('CAS05-R1 admits one real pg-boss queue idempotently while started', async () => {
    const fixture = await createControlDatabaseFixture();
    const delivery = new PgBossDeliveryRuntime(
      fixture.daemonUrl,
      fixture.ownerUrl,
    );
    const observer = new PgBoss(fixture.ownerUrl);
    observer.on('error', () => undefined);
    try {
      await delivery.start();
      await ensureQueue(delivery, 'workflow-execution');
      await ensureQueue(delivery, 'workflow-execution');
      await observer.start();
      await expect(observer.getQueues(['workflow-execution'])).resolves.toEqual(
        [expect.objectContaining({ name: 'workflow-execution' })],
      );
    } finally {
      await observer.stop({ graceful: true, close: true, timeout: 5_000 });
      await delivery.stop();
      await fixture.close();
    }
  });

  it('CAS03-L2-PG-BOSS rolls a transaction-owned job back with process state', async () => {
    const fixture = await createControlDatabaseFixture();
    const delivery = new PgBossDeliveryRuntime(
      fixture.daemonUrl,
      fixture.ownerUrl,
    );
    try {
      await delivery.start();
      const client = new Client({ connectionString: fixture.daemonUrl });
      await client.connect();
      try {
        await client.query('BEGIN');
        await delivery.enqueue(
          { executeSql: async (text, values) => client.query(text, values) },
          '00000000-0000-4000-8000-000000000031',
          {
            queue: 'control-command',
            data: { commandId: '00000000-0000-4000-8000-000000000031' },
            retryLimit: 1,
            retryDelaySeconds: 1,
            retryBackoff: false,
            expireInSeconds: 30,
          },
        );
        await client.query('ROLLBACK');
      } finally {
        await client.end();
      }
      await expect(
        delivery.findByCommandId('00000000-0000-4000-8000-000000000031'),
      ).resolves.toEqual([]);
    } finally {
      await delivery.stop();
      await fixture.close();
    }
  });

  it('creates one job for an exact command replay and delegates retry timing to pg-boss', async () => {
    const fixture = await createControlDatabaseFixture();
    const delivery = new PgBossDeliveryRuntime(
      fixture.daemonUrl,
      fixture.ownerUrl,
    );
    try {
      await delivery.start();
      const store = new PostgresControlStore(fixture.daemonUrl, delivery);
      const command = {
        commandId: '00000000-0000-4000-8000-000000000032',
        streamId: 'workflow:delivery',
        idempotencyKey: 'delivery-1',
        kind: 'workflow.dispatch',
        payload: {},
        events: [
          {
            eventId: '00000000-0000-4000-8000-000000000033',
            kind: 'delivery.requested',
            payload: {},
          },
        ],
        delivery: {
          queue: 'control-command',
          data: {},
          retryLimit: 1,
          retryDelaySeconds: 1,
          retryBackoff: false,
          expireInSeconds: 30,
        },
      } as const;
      await store.execute(command);
      await store.execute(command);
      await expect(
        delivery.findByCommandId(command.commandId),
      ).resolves.toHaveLength(1);

      let attempts = 0;
      await delivery.work('control-command', async () => {
        attempts += 1;
        throw new Error('controlled failure');
      });
      await expect
        .poll(
          async () => {
            const [job] = await delivery.findByCommandId(command.commandId);
            return { attempts, state: job?.state };
          },
          { timeout: 10_000, interval: 100 },
        )
        .toEqual({ attempts: 2, state: 'failed' });
    } finally {
      await delivery.stop();
      await fixture.close();
    }
  });
});

// === L2: END-TO-END TESTS ===

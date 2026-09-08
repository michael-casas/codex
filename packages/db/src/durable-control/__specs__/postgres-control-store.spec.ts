import { Client } from 'pg';
import { describe, expect, it } from 'vitest';

import { PostgresControlStore } from '../postgres-control-store.js';
import { createControlDatabaseFixture } from '../testing/control-database-fixture.js';

// === L2: REAL-BOUNDARY INTEGRATION TESTS ===
describe('[L2:INTEGRATION] PostgreSQL durable control store', () => {
  it('CAS03-L2-POSTGRES commits command, event, artifact, and projection atomically', async () => {
    const fixture = await createControlDatabaseFixture();
    const store = new PostgresControlStore(fixture.daemonUrl);
    try {
      const result = await store.execute({
        commandId: '00000000-0000-4000-8000-000000000001',
        streamId: 'workflow:alpha',
        idempotencyKey: 'run-alpha',
        kind: 'workflow.start',
        payload: { workflow: 'alpha' },
        events: [
          {
            eventId: '00000000-0000-4000-8000-000000000002',
            kind: 'workflow.started',
            payload: { workflow: 'alpha' },
          },
        ],
        artifacts: [
          {
            artifactId: '00000000-0000-4000-8000-000000000003',
            kind: 'assignment',
            mediaType: 'application/json',
            content: Buffer.from('{"assignment":"alpha"}'),
          },
        ],
      });

      expect(result).toMatchObject({
        commandId: '00000000-0000-4000-8000-000000000001',
        cursor: '1',
        eventCount: 1,
        replayed: false,
      });
      expect(result.replaySha256).toMatch(/^sha256:[a-f0-9]{64}$/);

      const replay = await store.execute({
        commandId: '00000000-0000-4000-8000-000000000001',
        streamId: 'workflow:alpha',
        idempotencyKey: 'run-alpha',
        kind: 'workflow.start',
        payload: { workflow: 'alpha' },
        events: [],
      });
      expect(replay).toMatchObject({
        commandId: result.commandId,
        cursor: '1',
        replayed: true,
      });
    } finally {
      await fixture.close();
    }
  });

  it('rejects conflicting idempotency with no additional event', async () => {
    const fixture = await createControlDatabaseFixture();
    const store = new PostgresControlStore(fixture.daemonUrl);
    try {
      await store.execute({
        commandId: '00000000-0000-4000-8000-000000000011',
        streamId: 'workflow:conflict',
        idempotencyKey: 'same-key',
        kind: 'workflow.start',
        payload: { value: 1 },
        events: [],
      });
      await expect(
        store.execute({
          commandId: '00000000-0000-4000-8000-000000000012',
          streamId: 'workflow:conflict',
          idempotencyKey: 'same-key',
          kind: 'workflow.start',
          payload: { value: 2 },
          events: [],
        }),
      ).rejects.toThrow('CONTROL_IDEMPOTENCY_CONFLICT');
      await expect(
        store.events('workflow:conflict', '0'),
      ).resolves.toHaveLength(0);
    } finally {
      await fixture.close();
    }
  });

  it('enforces scoped mutation, delivery admission, and artifact integrity', async () => {
    const fixture = await createControlDatabaseFixture();
    const store = new PostgresControlStore(fixture.daemonUrl);
    try {
      await expect(
        new PostgresControlStore(fixture.readerUrl).execute({
          commandId: '00000000-0000-4000-8000-000000000041',
          streamId: 'workflow:forbidden',
          idempotencyKey: 'forbidden-1',
          kind: 'workflow.start',
          payload: {},
          events: [],
        }),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        store.execute({
          commandId: '00000000-0000-4000-8000-000000000042',
          streamId: 'workflow:forbidden',
          idempotencyKey: 'forbidden-2',
          kind: 'workflow.dispatch',
          payload: {},
          events: [],
          delivery: {
            queue: 'control-command',
            data: {},
            retryLimit: 0,
            retryDelaySeconds: 0,
            retryBackoff: false,
            expireInSeconds: 30,
          },
        }),
      ).rejects.toThrow('CONTROL_DELIVERY_UNAUTHORIZED');
      await expect(
        store.events('workflow:forbidden', '0'),
      ).resolves.toHaveLength(0);

      const accepted = await store.execute({
        commandId: '00000000-0000-4000-8000-000000000043',
        streamId: 'workflow:integrity',
        idempotencyKey: 'integrity-1',
        kind: 'workflow.start',
        payload: {},
        events: [],
      });
      const client = new Client({ connectionString: fixture.daemonUrl });
      await client.connect();
      try {
        await expect(
          client.query('DELETE FROM process.control_command'),
        ).rejects.toMatchObject({ code: '42501' });
        await expect(
          client.query('TRUNCATE process.control_event'),
        ).rejects.toMatchObject({ code: '42501' });
        await expect(
          client.query(
            'SELECT process.register_control_artifact($1::uuid,$2::uuid,$3::text,$4::text,$5::text,$6::bytea,$7::text)',
            [
              '00000000-0000-4000-8000-000000000044',
              accepted.commandId,
              'workflow:integrity',
              'assignment',
              'application/json',
              Buffer.from('{}'),
              `sha256:${'f'.repeat(64)}`,
            ],
          ),
        ).rejects.toMatchObject({ code: '23514' });
      } finally {
        await client.end();
      }
    } finally {
      await fixture.close();
    }
  });
});

// === L2: END-TO-END TESTS ===

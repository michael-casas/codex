import { describe, expect, it } from 'vitest';

import { PostgresControlStore } from '../postgres-control-store.js';
import { createControlDatabaseFixture } from '../testing/control-database-fixture.js';

// === L2: REAL-BOUNDARY INTEGRATION TESTS ===
describe('[L2:INTEGRATION] PostgreSQL durable control cursor', () => {
  it('CAS03-L2-CURSOR-RESTART resumes strictly after a durable cursor', async () => {
    const fixture = await createControlDatabaseFixture();
    try {
      const firstStore = new PostgresControlStore(fixture.daemonUrl);
      const first = await firstStore.execute({
        commandId: '00000000-0000-4000-8000-000000000021',
        streamId: 'workflow:resume',
        idempotencyKey: 'resume-1',
        kind: 'workflow.start',
        payload: {},
        events: [
          {
            eventId: '00000000-0000-4000-8000-000000000022',
            kind: 'workflow.started',
            payload: {},
          },
        ],
      });
      const restartedStore = new PostgresControlStore(fixture.daemonUrl);
      await restartedStore.execute({
        commandId: '00000000-0000-4000-8000-000000000023',
        streamId: 'workflow:resume',
        idempotencyKey: 'resume-2',
        kind: 'workflow.finish',
        payload: {},
        events: [
          {
            eventId: '00000000-0000-4000-8000-000000000024',
            kind: 'workflow.finished',
            payload: {},
          },
        ],
      });

      const resumed = await restartedStore.events(
        'workflow:resume',
        first.cursor,
      );
      expect(resumed).toEqual([
        expect.objectContaining({ sequence: 2n, kind: 'workflow.finished' }),
      ]);
    } finally {
      await fixture.close();
    }
  });

  it('closes the snapshot/listen race and persists a monotonic consumer cursor', async () => {
    const fixture = await createControlDatabaseFixture();
    const store = new PostgresControlStore(fixture.daemonUrl);
    const abort = new AbortController();
    try {
      await store.execute({
        commandId: '00000000-0000-4000-8000-000000000025',
        streamId: 'workflow:live',
        idempotencyKey: 'live-1',
        kind: 'workflow.start',
        payload: {},
        events: [
          {
            eventId: '00000000-0000-4000-8000-000000000026',
            kind: 'workflow.started',
            payload: {},
          },
        ],
      });

      const feed = store
        .subscribe('workflow:live', '0', abort.signal)
        [Symbol.asyncIterator]();
      await expect(feed.next()).resolves.toMatchObject({
        value: { sequence: 1n, kind: 'workflow.started' },
      });
      await store.execute({
        commandId: '00000000-0000-4000-8000-000000000027',
        streamId: 'workflow:live',
        idempotencyKey: 'live-2',
        kind: 'workflow.finish',
        payload: {},
        events: [
          {
            eventId: '00000000-0000-4000-8000-000000000028',
            kind: 'workflow.finished',
            payload: {},
          },
        ],
      });
      await expect(feed.next()).resolves.toMatchObject({
        value: { sequence: 2n, kind: 'workflow.finished' },
      });
      await expect(
        store.advanceCursor('viewer:one', 'workflow:live', '2'),
      ).resolves.toBe('2');
      await expect(
        store.advanceCursor('viewer:one', 'workflow:live', '1'),
      ).resolves.toBe('2');
      abort.abort();
      await feed.return?.();
    } finally {
      abort.abort();
      await fixture.close();
    }
  });
});

// === L2: END-TO-END TESTS ===

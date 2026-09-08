import { randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { expect, it } from 'vitest';
import {
  PostgresControlStore,
  PostgresRuntimeVisibilityRepository,
} from '@codex/db';
import { createRuntimeVisibilityDatabaseFixture } from '@codex/db/testing';
import {
  normalizeVisibilityObservation,
  runtimeVisibilitySha256,
  type NormalizedVisibilityEvent,
} from '@codex/process';
import { createRuntimeVisibilityDaemon } from '../runtime-visibility-daemon.js';

// === L2: REAL-BOUNDARY INTEGRATION TESTS ===
it('[L2:INTEGRATION] R2-REPLAY-LEGACY-PERSISTENCE replays R1 payloads through unchanged 007 without weakening conflicts', async ({
  task,
}) => {
  const metadata = task.meta as Record<string, unknown>;
  const database = await createRuntimeVisibilityDatabaseFixture();
  const owner = new Client({ connectionString: database.ownerUrl });
  const repository = new PostgresRuntimeVisibilityRepository(
    database.daemonUrl,
  );
  let opened = 0,
    closed = 0;
  const options = {
    sourcePage: (after: string) => repository.sourcePage(after),
    async listenSource(
      onSequence: (sequence: string) => void,
      onError: (error: unknown) => void,
    ) {
      const stop = await repository.listenSource(onSequence, onError);
      opened++;
      return async () => {
        await stop();
        closed++;
      };
    },
  };
  let daemon = createRuntimeVisibilityDaemon(repository, options);
  const runId = `workflow_${'c'.repeat(64)}`;
  const reference = `source.${'d'.repeat(64)}`;
  const store = new PostgresControlStore(database.daemonUrl);
  const append = (
    kind: string,
    payload: Record<string, unknown>,
    run = runId,
  ) =>
    store.execute({
      commandId: randomUUID(),
      streamId: `workflow:${run}`,
      idempotencyKey: randomUUID(),
      kind,
      payload,
      events: [{ eventId: randomUUID(), kind, payload }],
    });
  const fingerprints = async () =>
    (
      await owner.query<{ event_id: string; event_sha256: string }>(
        'SELECT event_id,event_sha256 FROM process.runtime_visibility_event ORDER BY sequence',
      )
    ).rows;
  await owner.connect();
  try {
    for (const file of [
      '003_agent_messaging.sql',
      '004_agent_delegation.sql',
      '006_visibility_source_reads.sql',
    ])
      await owner.query(
        await readFile(resolve('migrations/process', file), 'utf8'),
      );
    const lifecycle = [
      ['workflow.accepted', 'queued'],
      ['workflow.execution.started', 'running'],
      ['workflow.started', 'running'],
      ['workflow.failed', 'failed'],
    ] as const;
    for (const [kind] of lifecycle)
      await append(kind, {
        runId,
        ...(kind === 'workflow.accepted' ? { workflowRef: reference } : {}),
      });
    const source = await repository.sourcePage('0');
    expect(source).toHaveLength(4);
    const oldEvents: NormalizedVisibilityEvent[] = source.map(
      (event, index) => {
        const old = normalizeVisibilityObservation({
          eventId: `source:${event.eventId}`,
          source: 'workflow',
          kind: event.kind,
          occurredAt: event.occurredAt,
          workflowId: runId,
          status: lifecycle[index][1],
          title: reference,
        });
        if (!old) throw Error('LEGACY_NORMALIZATION_MISSING');
        return old;
      },
    );
    for (const event of oldEvents) await repository.ingest(event);
    const before = await fingerprints();
    expect(before).toEqual(
      oldEvents.map((event) => ({
        event_id: event.eventId,
        event_sha256: runtimeVisibilitySha256(event),
      })),
    );
    metadata['legacyBefore'] = before;
    const migration = await readFile(
      resolve('migrations/process/007_visibility_items.sql'),
      'utf8',
    );
    metadata['migration007Sha256'] = createHash('sha256')
      .update(migration)
      .digest('hex');
    await owner.query(migration);
    await expect(daemon.start()).resolves.toBeUndefined();
    expect(await fingerprints()).toEqual(before);
    for (let restart = 0; restart < 2; restart++) {
      await daemon.stop();
      daemon = createRuntimeVisibilityDaemon(repository, options);
      await daemon.start();
      expect(await fingerprints()).toEqual(before);
      expect((await daemon.snapshot()).workflows?.[0]?.label).toBe(reference);
    }
    const modernRun = `workflow_${'e'.repeat(64)}`;
    await append(
      'workflow.accepted',
      {
        runId: modernRun,
        workflowRef: `source.${'f'.repeat(64)}`,
        display: { id: 'modern-workflow', title: 'Modern human title' },
      },
      modernRun,
    );
    await expect
      .poll(
        async () =>
          (await daemon.snapshot()).workflows?.find(
            (workflow) => workflow.id === modernRun,
          )?.label,
      )
      .toBe('Modern human title');
    const withModern = await fingerprints();
    expect(withModern).toHaveLength(5);
    expect(withModern.slice(0, 4)).toEqual(before);
    await expect(
      repository.ingest({ ...oldEvents[0], title: 'Mutated duplicate' }),
    ).rejects.toMatchObject({ code: 'VISIBILITY_EVENT_CONFLICT' });
    expect(await fingerprints()).toEqual(withModern);
    expect(
      (await store.events(`workflow:${runId}`, '0')).map(
        (event) => event.eventId,
      ),
    ).toEqual(source.map((event) => event.eventId));
    metadata['legacyAfter'] = withModern.slice(0, 4);
  } finally {
    try {
      await daemon.stop();
    } finally {
      await owner.end();
      await database.close();
      const inspect = new Client({
        connectionString: process.env['POSTGRES_URL'],
      });
      await inspect.connect();
      try {
        const remaining = await inspect.query<{ count: number }>(
          'SELECT count(*)::int AS count FROM pg_database WHERE datname=$1',
          [database.databaseName],
        );
        const roles = [
          new URL(database.daemonUrl).username,
          new URL(database.readerUrl).username,
        ];
        const remainingRoles = await inspect.query<{ count: number }>(
          'SELECT count(*)::int AS count FROM pg_roles WHERE rolname=ANY($1::text[])',
          [roles],
        );
        expect(remaining.rows[0]?.count).toBe(0);
        expect(remainingRoles.rows[0]?.count).toBe(0);
        expect(closed).toBe(opened);
        metadata['cleanup'] = {
          databaseRemoved: true,
          rolesRemoved: true,
          listenersOpened: opened,
          listenersClosed: closed,
        };
      } finally {
        await inspect.end();
      }
    }
  }
}, 30_000);

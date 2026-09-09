import { createHash, randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { describe, it, expect } from 'vitest';
import { artifact } from '@codex/workflows';
import { PostgresControlStore } from '@codex/db';
import { createControlDatabaseFixture } from '@codex/db/testing';
import {
  artifactFixture,
  artifactNames,
  artifactContent,
  artifactDigest,
} from '../support/artifact-publication.fixture.js';

// === L2: REAL-BOUNDARY INTEGRATION TESTS ===
describe('[L2:INTEGRATION] durable artifact publication', () => {
  it('ARTIFACT-L2-REPRO reproduces mixed-case kind rejection in the unchanged real schema', async () => {
    const database = await createControlDatabaseFixture();
    const store = new PostgresControlStore(database.daemonUrl);
    try {
      for (const kind of ['firstHalf.md', 'README.md']) {
        await expect(
          store.execute({
            commandId: randomUUID(),
            streamId: 'artifact:repro',
            idempotencyKey: kind,
            kind: 'workflow.artifact.registered',
            payload: { name: kind },
            events: [
              {
                eventId: randomUUID(),
                kind: 'workflow.artifact.registered',
                payload: { name: kind },
              },
            ],
            artifacts: [
              {
                artifactId: randomUUID(),
                kind,
                mediaType: 'text/markdown',
                content: Buffer.from(artifactContent),
              },
            ],
          }),
        ).rejects.toMatchObject({
          code: '23514',
          constraint: 'control_artifact_kind_check',
        });
      }
      expect(await store.events('artifact:repro', '0')).toEqual([]);
    } finally {
      await database.close();
    }
  });

  it('ARTIFACT-L2-NAMES persists exact names, IDs, bytes and legacy metadata across replay', async () => {
    const database = await createControlDatabaseFixture();
    const store = new PostgresControlStore(database.daemonUrl);
    const owner = new Client({ connectionString: database.ownerUrl });
    await owner.connect();
    const legacyId = randomUUID();
    const f = artifactFixture({
      store,
      run: async () => {
        await artifact('legacy.md', {
          value: artifactContent,
          mediaType: 'text/markdown',
        });
        for (const name of artifactNames)
          await artifact(name, {
            value: artifactContent,
            mediaType: 'text/markdown',
          });
        await artifact('README.md', {
          value: artifactContent,
          mediaType: 'text/markdown',
        });
        return 'published';
      },
    });
    const legacy = {
      name: 'legacy.md',
      path: `control://${f.prepared.runId}/artifacts/${legacyId}`,
      digest: artifactDigest,
      mediaType: 'text/markdown',
    };
    try {
      await store.execute({
        commandId: randomUUID(),
        streamId: `workflow:${f.prepared.runId}`,
        idempotencyKey: 'historical-artifact',
        kind: 'workflow.artifact.registered',
        payload: legacy,
        events: [
          {
            eventId: randomUUID(),
            kind: 'workflow.artifact.registered',
            payload: legacy,
          },
        ],
        artifacts: [
          {
            artifactId: legacyId,
            kind: 'legacy.md',
            mediaType: legacy.mediaType,
            content: Buffer.from(artifactContent),
          },
        ],
      });
      const historical = (
        await owner.query(
          'SELECT * FROM process.control_artifact WHERE artifact_id = $1',
          [legacyId],
        )
      ).rows;
      await f.run();
      const reader = new PostgresControlStore(database.readerUrl);
      const events = await reader.events(`workflow:${f.prepared.runId}`, '0');
      expect(events.at(-1)?.kind).toBe('workflow.completed');
      const registered = events
        .filter((e) => e.kind === 'workflow.artifact.registered')
        .map((e) => e.payload);
      expect(registered.map((a) => a.name)).toEqual([
        'legacy.md',
        ...artifactNames,
      ]);
      expect(registered[0]).toEqual(legacy);
      expect(new Set(registered.map((a) => a.path)).size).toBe(
        artifactNames.length + 1,
      );
      for (const a of registered.slice(1)) {
        const hex = createHash('sha256')
          .update(`${f.prepared.runId}:artifact:${a.name}:${artifactDigest}`)
          .digest('hex');
        const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
        expect(a).toMatchObject({
          path: `control://${f.prepared.runId}/artifacts/${id}`,
          digest: artifactDigest,
          mediaType: 'text/markdown',
        });
        const row = (
          await owner.query(
            'SELECT kind, media_type, content, sha256 FROM process.control_artifact WHERE artifact_id = $1',
            [id],
          )
        ).rows[0];
        expect(row).toEqual({
          kind: 'artifact',
          media_type: 'text/markdown',
          content: Buffer.from(artifactContent),
          sha256: artifactDigest,
        });
      }
      // A new daemon consumes durable state; it must not republish or rewrite historical rows.
      await artifactFixture({ store }).run();
      expect(await reader.events(`workflow:${f.prepared.runId}`, '0')).toEqual(
        events,
      );
      expect(
        (
          await owner.query(
            'SELECT * FROM process.control_artifact WHERE artifact_id = $1',
            [legacyId],
          )
        ).rows,
      ).toEqual(historical);
      expect(
        (
          await owner.query(
            'SELECT count(*)::int AS count FROM process.control_artifact',
          )
        ).rows[0].count,
      ).toBe(artifactNames.length + 1);
    } finally {
      await owner.end();
      await database.close();
    }
  });

  it('ARTIFACT-L2-FAILURE retains safe classification for real storage rejection and rolls back registration', async () => {
    const database = await createControlDatabaseFixture();
    const store = new PostgresControlStore(database.daemonUrl);
    const f = artifactFixture({
      store,
      run: async () => {
        await artifact('empty.md', { value: '', mediaType: 'text/markdown' });
        return 'unreachable';
      },
    });
    try {
      await f.run();
      const events = await store.events(`workflow:${f.prepared.runId}`, '0');
      expect(events.at(-1)?.payload).toEqual({
        runId: f.prepared.runId,
        diagnostic: 'artifact-failed',
        storageCode: '23514',
      });
      expect(events.find((e) => e.kind === 'phase.failed')?.payload.phase).toBe(
        'Preserve fixture evidence',
      );
      expect(
        events.some((e) => e.kind === 'workflow.artifact.registered'),
      ).toBe(false);
      expect(JSON.stringify(events.map((e) => e.payload))).not.toMatch(
        /INSERT|control_artifact|constraint|empty.md/,
      );
    } finally {
      await database.close();
    }
  });

  it('ARTIFACT-L2-CONFLICT preserves original JSON content when a name is reused with different bytes', async () => {
    const database = await createControlDatabaseFixture();
    const store = new PostgresControlStore(database.daemonUrl);
    const owner = new Client({ connectionString: database.ownerUrl });
    await owner.connect();
    const f = artifactFixture({
      store,
      run: async () => {
        await artifact('data.json', { fixture: 1 });
        await artifact('data.json', { fixture: 2 });
        return 'unreachable';
      },
    });
    try {
      await f.run();
      const events = await store.events(`workflow:${f.prepared.runId}`, '0');
      expect(events.at(-1)?.payload).toEqual({
        runId: f.prepared.runId,
        diagnostic: 'artifact-failed',
        storageCode: 'UNKNOWN',
      });
      expect(
        events.filter((e) => e.kind === 'workflow.artifact.registered'),
      ).toHaveLength(1);
      expect(
        (
          await owner.query(
            'SELECT media_type, content FROM process.control_artifact',
          )
        ).rows,
      ).toEqual([
        {
          media_type: 'application/json',
          content: Buffer.from('{"fixture":1}'),
        },
      ]);
    } finally {
      await owner.end();
      await database.close();
    }
  });
});

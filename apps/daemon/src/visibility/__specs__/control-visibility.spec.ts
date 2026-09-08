import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from 'pg';
import { describe, expect, it } from 'vitest';
import {
  PostgresControlStore,
  PostgresRuntimeVisibilityRepository,
} from '@codex/db';
import { createRuntimeVisibilityDatabaseFixture } from '@codex/db/testing';
import {
  createProductionControlRuntime,
  type ProductionControlConfig,
} from '../../main.js';
import { createRuntimeVisibilityDaemon } from '../runtime-visibility-daemon.js';
import type { VisibilityResult } from '@codex/process';
const agentId = (run: string, node: string) =>
  `agent:${createHash('sha256').update(`${run}\0${node}`).digest('hex')}`;

// === L2: END-TO-END TESTS ===
describe('[L2:E2E] production visibility source replay', () => {
  it('UIR1-L2-REPLAY reconstructs real durable workflow events and preserves selected feed across restart', async () => {
    const database = await createRuntimeVisibilityDatabaseFixture();
    const root = await mkdtemp(join(tmpdir(), 'cas-ui-source-'));
    const owner = new Client({ connectionString: database.ownerUrl });
    let runtime:
      | Awaited<ReturnType<typeof createProductionControlRuntime>>
      | undefined;
    await owner.connect();
    try {
      for (const name of [
        '003_agent_messaging.sql',
        '004_agent_delegation.sql',
        '006_visibility_source_reads.sql',
      ]) {
        const migration = await readFile(
          resolve('migrations/process', name),
          'utf8',
        ).catch((error) => {
          if (
            name === '006_visibility_source_reads.sql' &&
            error.code === 'ENOENT'
          )
            return undefined;
          throw error;
        });
        if (migration) await owner.query(migration);
      }
      await mkdir(join(root, 'ui'));
      await writeFile(join(root, 'ui/index.html'), '<h1>Control</h1>');
      await writeFile(join(root, 'token'), 'x'.repeat(64), { mode: 0o600 });
      const config: ProductionControlConfig = {
        hosts: [
          {
            hostId: 'unused-local',
            transport: 'local-proxy',
            expectedVersion: '0.151.0',
          },
        ],
        repositories: [
          {
            hostId: 'unused-local',
            repositoryId: 'fixture',
            checkoutPath: root,
            leaseRoot: root,
          },
        ],
        workflows: [
          {
            workflowRef: 'never-executed',
            modulePath: join(root, 'never.mjs'),
          },
        ],
        viewer: {
          host: '127.0.0.1',
          port: 0,
          tokenFile: join(root, 'token'),
          uiDirectory: join(root, 'ui'),
        },
      };
      const store = new PostgresControlStore(database.daemonUrl);
      const runId = `workflow_${'b'.repeat(64)}`;
      const append = (kind: string, payload: Record<string, unknown>) =>
        store.execute({
          commandId: randomUUID(),
          streamId: `workflow:${runId}`,
          idempotencyKey: randomUUID(),
          kind,
          payload,
          events: [{ eventId: randomUUID(), kind, payload }],
        });
      await append('workflow.started', { runId });
      await append('node.frozen', {
        runId,
        node: { id: 'fixture:001:a', label: 'Agent A', phase: 'Research' },
      });
      await append('node.frozen', {
        runId,
        node: { id: 'fixture:002:b', label: 'Agent B', phase: 'Research' },
      });
      await append('node.started', { runId, nodeId: 'fixture:001:a' });
      runtime = await createProductionControlRuntime(
        database.daemonUrl,
        database.ownerUrl,
        config,
      );
      await runtime.start();
      const get = async (selectedAgentId?: string) => {
        const url = new URL('/api/control/snapshot', runtime?.browserOrigin);
        if (selectedAgentId)
          url.searchParams.set('selectedAgentId', selectedAgentId);
        const response = await fetch(url);
        expect(response.status).toBe(200);
        return response.json() as Promise<VisibilityResult>;
      };
      const before = await get();
      expect(before.workflows).toHaveLength(1);
      expect(before.workflows?.[0]?.steps[0]?.agents).toHaveLength(2);
      await append('node.failed', {
        runId,
        nodeId: 'fixture:001:a',
        diagnostic: 'agent-failed',
      });
      await append('workflow.failed', {
        runId,
        diagnostic: 'execution-failed',
      });
      await expect
        .poll(async () => (await get()).workflows?.[0]?.status)
        .toBe('failed');
      const final = await get();
      await runtime.stop();
      runtime = await createProductionControlRuntime(
        database.daemonUrl,
        database.ownerUrl,
        config,
      );
      await runtime.start();
      expect(await get()).toEqual(final);
      const selected = await get(agentId(runId, 'fixture:001:a'));
      expect(selected.details?.agentId).toBe(agentId(runId, 'fixture:001:a'));
      expect((await get()).details).toBeUndefined();
      expect(
        await owner
          .query('SELECT * FROM process.read_visibility_source_events(-1, 10)')
          .then(
            () => 'unexpected',
            () => 'denied',
          ),
      ).toBe('denied');
      expect(
        await owner
          .query('SELECT * FROM process.read_visibility_source_events(0, 1001)')
          .then(
            () => 'unexpected',
            () => 'denied',
          ),
      ).toBe('denied');
    } finally {
      await runtime?.stop();
      await owner.end();
      await database.close();
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  it('UIR1-L2-IDENTITY separates selected feeds for two runs with the same node ID', async () => {
    const database = await createRuntimeVisibilityDatabaseFixture();
    const owner = new Client({ connectionString: database.ownerUrl });
    await owner.connect();
    const repository = new PostgresRuntimeVisibilityRepository(
      database.daemonUrl,
    );
    const options = {
      sourcePage: (after: string) => repository.sourcePage(after),
    };
    const daemon = createRuntimeVisibilityDaemon(repository, options);
    try {
      for (const migration of [
        '004_agent_delegation.sql',
        '006_visibility_source_reads.sql',
      ])
        await owner.query(
          await readFile(resolve('migrations/process', migration), 'utf8'),
        );
      const store = new PostgresControlStore(database.daemonUrl);
      const runs = [`workflow_${'c'.repeat(64)}`, `workflow_${'d'.repeat(64)}`];
      for (const [index, run] of runs.entries())
        for (const [kind, payload] of [
          [
            'node.frozen',
            {
              runId: run,
              node: { id: 'same:001:a', label: 'Agent', phase: 'Research' },
            },
          ],
          [
            'workflow.visibility.observed',
            {
              observation: {
                kind: 'item.completed',
                nodeId: 'same:001:a',
                itemId: 'item-a',
                detail: { type: 'message', body: `run-${index}-only` },
              },
            },
          ],
        ] as const)
          await store.execute({
            commandId: randomUUID(),
            streamId: `workflow:${run}`,
            idempotencyKey: randomUUID(),
            kind,
            payload,
            events: [{ eventId: randomUUID(), kind, payload }],
          });
      await daemon.start();
      for (const [index, run] of runs.entries()) {
        const selected = await daemon.snapshot({
          selectedAgentId: agentId(run, 'same:001:a'),
        });
        expect(
          selected.details?.events.map((event) => event.detail?.body),
        ).toEqual([`run-${index}-only`]);
      }
    } finally {
      await daemon.stop();
      await owner.end();
      await database.close();
    }
  }, 30_000);
});

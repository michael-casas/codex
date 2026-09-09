import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
import { describe, it, expect } from 'vitest';
import { createControlDatabaseFixture } from '@codex/db/testing';
import { PostgresAgentMessageStore, PostgresControlStore } from '@codex/db';
import { PgBossDeliveryRuntime } from '@codex/delivery';
import { agent, defineWorkflow, prepareWorkflowRun } from '@codex/workflows';
import { createAgentMessenger } from '@codex/process';
import { createWorkflowExecutionDaemon } from '../workflow-execution-daemon.js';

// === L2: REAL-BOUNDARY INTEGRATION TESTS ===
describe('[L2:INTEGRATION] MEADOW ownership compatibility', () => {
  it('preserves legacy runtimes, fails historical adoption closed, rejects reader writes and rolls back failed outbox', async () => {
    const db = await createControlDatabaseFixture();
    const owner = new Client({ connectionString: db.ownerUrl });
    const reader = new Client({ connectionString: db.readerUrl });
    await owner.connect();
    await reader.connect();
    try {
      for (const n of ['003_agent_messaging.sql', '004_agent_delegation.sql'])
        await owner.query(await readFile(`migrations/process/${n}`, 'utf8'));
      const store = new PostgresAgentMessageStore(db.daemonUrl, {
        enqueue: async () => 'fixture',
      });
      for (const agentId of ['legacy-a', 'legacy-b'])
        await store.register({
          agentId,
          hostId: 'host',
          threadId: agentId,
          sessionId: agentId,
        });
      const migration = await readFile(
        'migrations/process/008_coordinator_ownership.sql',
        'utf8',
      );
      await owner.query(migration);
      await owner.query(migration);
      const old = await store.submit({
        kind: 'send',
        idempotencyKey: 'legacy-message',
        fromAgentId: 'legacy-a',
        toAgentId: 'legacy-b',
        body: 'legacy',
      });
      expect(old.state).toBe('queued');
      await expect(
        store.registerOwned(
          {
            agentId: 'legacy-a',
            hostId: 'host',
            threadId: 'legacy-a',
            sessionId: 'legacy-a',
          },
          'codex-control',
        ),
      ).rejects.toThrow(/OWNERSHIP_CONFLICT/);
      await expect(
        reader.query(
          "SELECT process.register_owned_agent_runtime('evil','host','evil',NULL,'codex-control')",
        ),
      ).rejects.toMatchObject({ code: '42501' });
      await store.registerOwned(
        { agentId: 'owned', hostId: 'host', threadId: 'owned-thread' },
        'codex-control',
      );
      expect(await store.read('owned')).toEqual({
        agentId: 'owned',
        hostId: 'host',
        threadId: 'owned-thread',
      });
      const input = {
        kind: 'send' as const,
        idempotencyKey: 'rollback',
        fromAgentId: 'codex-control',
        toAgentId: 'owned',
        body: 'scoped',
      };
      await expect(
        new PostgresAgentMessageStore(db.daemonUrl).submitCoordinator(
          input,
          'codex-control',
        ),
      ).rejects.toThrow(/OUTBOX_WRITER_MISSING/);
      await expect(
        store.submit({ ...input, toAgentId: 'legacy-b' }),
      ).rejects.toThrow(/MESSAGE_UNAUTHORIZED/);
      expect(
        (
          await owner.query(
            'SELECT count(*)::int AS n FROM process.agent_message',
          )
        ).rows[0].n,
      ).toBe(1);
      expect(
        (
          await owner.query(
            'SELECT count(*)::int AS n FROM process.agent_message_outbox',
          )
        ).rows[0].n,
      ).toBe(1);
    } finally {
      await reader.end();
      await owner.end();
      await db.close();
    }
  }, 30000);
});
// === L2: END-TO-END TESTS ===
describe('[L2:E2E] MEADOW workflow admission ownership', () => {
  it('persists trusted workflow ownership through delivery restart and registers the provider-bound recipient', async () => {
    const db = await createControlDatabaseFixture();
    const owner = new Client({ connectionString: db.ownerUrl });
    await owner.connect();
    const delivery = new PgBossDeliveryRuntime(db.daemonUrl, db.ownerUrl);
    let service: ReturnType<typeof createWorkflowExecutionDaemon> | undefined;
    try {
      for (const n of [
        '003_agent_messaging.sql',
        '004_agent_delegation.sql',
        '008_coordinator_ownership.sql',
      ])
        await owner.query(await readFile(`migrations/process/${n}`, 'utf8'));
      const store = new PostgresControlStore(db.daemonUrl, delivery);
      const directory = new PostgresAgentMessageStore(db.daemonUrl, {
        enqueue: async () => 'fixture',
      });
      const command = {
        workflowRef: 'owned.workflow',
        sourceDigest: `sha256:${'a'.repeat(64)}` as const,
        input: {},
        hostId: 'fixture-host',
        workspace: {
          repositoryId: 'repo',
          baseRevision: 'b'.repeat(40),
          assignmentId: 'owned',
        },
        runtimeProfile: {
          model: 'gpt-5.6-luna',
          reasoningEffort: 'low',
          sandbox: 'readOnly',
          approvalPolicy: 'never',
        },
        idempotencyKey: 'owned-workflow',
      } as const;
      const dependencies = {
        store,
        delivery,
        hosts: { connect: async () => ({}) },
        workspaces: {
          acquire: async () => ({ workspaceRef: 'fixture' }),
          resolve: async () => ({
            cwd: '/fixture',
            tempDirectory: '/fixture/tmp',
          }),
          release: async () => undefined,
        },
        resolveWorkflow: async () => ({
          sourceDigest: command.sourceDigest,
          definition: defineWorkflow({
            id: 'fixture',
            run: async () =>
              agent({
                label: 'Owned agent',
                model: 'gpt-5.6-luna',
                reasoning: 'low',
                prompt: 'fixture',
              }),
          }),
        }),
        registerRuntime: (
          r: { agentId: string; hostId: string; threadId: string },
          o: string,
        ) => directory.registerOwned(r, o),
        createExecutor: () => ({
          executeAgent: async (
            request: Parameters<
              import('../workflow-execution-daemon.js').WorkflowRuntimeExecutor['executeAgent']
            >[0],
          ) => {
            await request.onRuntimeEvent({
              type: 'thread.started',
              nodeId: request.node.id,
              threadId: 'provider-thread',
            });
            return {
              threadId: 'provider-thread',
              finalResponse: 'done',
              usage: null,
            };
          },
          close: async () => undefined,
        }),
      };
      await delivery.start();
      await delivery.ensureQueue('workflow-execution');
      await delivery.ensureQueue('workflow-execution-dead');
      const admitted = await createWorkflowExecutionDaemon(
        dependencies,
      ).runWorkflow(command, {
        actorAgentId: 'codex-control',
        scopes: ['control:workflow'],
      });
      service = createWorkflowExecutionDaemon(dependencies);
      await service.start();
      for (
        let i = 0;
        i < 100 &&
        (await service.readWorkflow(admitted.runId)).state !== 'completed';
        i++
      )
        await new Promise((r) => setTimeout(r, 50));
      expect((await service.readWorkflow(admitted.runId)).state).toBe(
        'completed',
      );
      const recipients = await directory.list();
      expect(recipients).toHaveLength(1);
      expect(recipients[0]).toMatchObject({
        hostId: 'fixture-host',
        threadId: 'provider-thread',
      });
      const message = {
        idempotencyKey: 'workflow-message',
        fromAgentId: 'codex-control',
        toAgentId: recipients[0].agentId,
        body: 'owned',
      };
      expect(
        (
          await createAgentMessenger(directory).send(message, {
            actorAgentId: 'codex-control',
            scopes: ['control:message'],
          })
        ).state,
      ).toBe('queued');
      await expect(
        service.runWorkflow(command, {
          actorAgentId: 'foreign',
          scopes: ['control:workflow'],
        }),
      ).rejects.toThrow(/IDEMPOTENCY_CONFLICT/);
      const accepted = await store.events(
        prepareWorkflowRun(command).streamId,
        '0',
      );
      expect(
        accepted.find((e) => e.kind === 'workflow.accepted')?.payload
          .ownerAgentId,
      ).toBe('codex-control');
    } finally {
      await service?.stop();
      await delivery.stop();
      await owner.end();
      await db.close();
    }
  }, 30000);
});

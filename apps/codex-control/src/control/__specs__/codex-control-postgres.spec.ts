import { PostgresControlStore } from '@codex/db';
import { createControlDatabaseFixture } from '@codex/db/testing';
import { PgBossDeliveryRuntime } from '@codex/delivery';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';

import { createCodexControlServer } from '../codex-control.gateway.js';
import { createCodexControlPlane } from '../codex-control.module.js';

// === L2: END-TO-END TESTS ===
describe('[L2:E2E] codex-control durable workflow boundary', () => {
  it('submits once, replays exactly, and rejects a conflict with no extra write', async () => {
    const fixture = await createControlDatabaseFixture();
    const delivery = new PgBossDeliveryRuntime(
      fixture.daemonUrl,
      fixture.ownerUrl,
    );
    const store = new PostgresControlStore(fixture.daemonUrl, delivery);
    const server = createCodexControlServer({
      control: createCodexControlPlane({
        delegation: {
          delegateAgent: async () => ({}),
          cancelAgent: async () => ({}),
        },
        messaging: {
          send: async () => ({
            messageId: 'm',
            correlationId: 'c',
            state: 'queued',
          }),
          ask: async () => ({
            messageId: 'm',
            correlationId: 'c',
            state: 'queued',
          }),
          reply: async () => ({
            messageId: 'm',
            correlationId: 'c',
            state: 'queued',
          }),
        },
        visibility: { snapshot: async () => ({}), wait: async () => ({}) },
        workflowStore: store,
      }),
      authorize: () => ({
        actorAgentId: 'cas-09-postgres',
        scopes: ['control:workflow'],
      }),
    });
    const client = new Client({ name: 'cas-09-postgres', version: '1.0.0' });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    try {
      await delivery.start();
      await delivery.ensureQueue('workflow-execution');
      await delivery.ensureQueue('workflow-execution-dead');
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const command = {
        workflowRef: 'trusted.workflow',
        sourceDigest: `sha256:${'a'.repeat(64)}`,
        input: { topic: 'mcp' },
        hostId: 'local',
        repositoryId: 'codex',
        baseRevision: 'b'.repeat(40),
        assignmentId: 'CAS-09',
        model: 'gpt-5.6-sol',
        reasoningEffort: 'medium',
        sandbox: 'workspaceWrite',
        idempotencyKey: 'cas-09-postgres',
      };
      const first = await client.callTool({
        name: 'run_workflow',
        arguments: command,
      });
      const replay = await client.callTool({
        name: 'run_workflow',
        arguments: command,
      });
      expect(replay.structuredContent).toEqual(first.structuredContent);

      const runId = String(
        (first.structuredContent as Record<string, unknown> | undefined)?.runId,
      );
      const streamId = `workflow:${runId.slice('workflow_'.length)}`;
      expect(
        (await store.events(streamId, '0')).map(({ kind }) => kind),
      ).toEqual(['workflow.accepted', 'delivery.requested']);

      const conflict = await client.callTool({
        name: 'run_workflow',
        arguments: { ...command, input: { conflict: true } },
      });
      expect(conflict.isError).toBe(true);
      expect(await store.events(streamId, '0')).toHaveLength(2);
    } finally {
      await client.close().catch(() => undefined);
      await server.close().catch(() => undefined);
      await delivery.stop().catch(() => undefined);
      await fixture.close();
    }
  });
});

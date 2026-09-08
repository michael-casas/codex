import { describe, expect, it } from 'vitest';
import { Client } from 'pg';

import * as dbPackage from '../../index.js';
import { createAgentMessageDatabaseFixture } from '../testing/agent-message-database-fixture.js';

// === L2: REAL-BOUNDARY INTEGRATION TESTS ===
describe('[L2:INTEGRATION] PostgreSQL agent messaging', () => {
  it('CAS05-L2-POSTGRES commits message and outbox with replay and conflict no-write', async () => {
    const candidate = (dbPackage as Record<string, unknown>)
      .PostgresAgentMessageStore;
    expect(
      candidate,
      'CAS-05 PostgreSQL message/outbox transaction is not implemented',
    ).toBeTypeOf('function');
    const fixture = await createAgentMessageDatabaseFixture();
    const store = new (candidate as typeof dbPackage.PostgresAgentMessageStore)(
      fixture.daemonUrl,
      { enqueue: async () => '00000000-0000-4000-8000-000000000501' },
    );
    try {
      await store.register({
        agentId: 'agent-a',
        hostId: 'local',
        threadId: 'thread-a',
        sessionId: 'session-a',
      });
      await expect(
        store.register({
          agentId: 'agent-a',
          hostId: 'local',
          threadId: 'thread-a',
          sessionId: 'session-a',
        }),
      ).resolves.toMatchObject({ agentId: 'agent-a' });
      await expect(
        store.register({
          agentId: 'agent-a',
          hostId: 'other-host',
          threadId: 'other-thread',
          sessionId: 'other-session',
        }),
      ).rejects.toThrow(/AGENT_RUNTIME_CONFLICT/);
      await store.register({
        agentId: 'agent-b',
        hostId: 'remote',
        threadId: 'thread-b',
        sessionId: 'session-b',
      });
      const command = {
        kind: 'ask',
        idempotencyKey: 'ask-501',
        fromAgentId: 'agent-a',
        toAgentId: 'agent-b',
        body: 'question',
      } as const;
      const first = await store.submit(command);
      await expect(store.submit(command)).resolves.toEqual(first);
      await expect(
        store.submit({ ...command, body: 'conflict' }),
      ).rejects.toThrow(/MESSAGE_IDEMPOTENCY_CONFLICT/);
      await expect(
        store.submit({
          kind: 'reply',
          idempotencyKey: 'reply-invalid-501',
          fromAgentId: 'agent-b',
          toAgentId: 'agent-a',
          body: 'invalid answer',
          correlationId: '00000000-0000-4000-8000-000000000599',
        }),
      ).rejects.toThrow(/MESSAGE_CORRELATION_INVALID/);
      const reply = await store.submit({
        kind: 'reply',
        idempotencyKey: 'reply-501',
        fromAgentId: 'agent-b',
        toAgentId: 'agent-a',
        body: 'answer',
        correlationId: first.correlationId,
      });
      await expect(store.pending('agent-a')).resolves.toEqual([
        expect.objectContaining({
          messageId: reply.messageId,
          correlationId: first.correlationId,
          body: 'answer',
          state: 'queued',
        }),
      ]);
      await expect(store.delivery(first.messageId)).resolves.toMatchObject({
        state: 'replied',
      });
      await expect(store.mark(first.messageId, 'queued')).rejects.toThrow(
        /MESSAGE_STATE_INVALID/,
      );
      const concurrentCommand = {
        ...command,
        idempotencyKey: 'ask-concurrent-501',
        body: 'concurrent question',
      };
      const concurrent = await Promise.all([
        store.submit(concurrentCommand),
        store.submit(concurrentCommand),
      ]);
      expect(concurrent[0]).toEqual(concurrent[1]);

      const client = new Client({ connectionString: fixture.ownerUrl });
      await client.connect();
      try {
        const result = await client.query<{ messages: number; outbox: number }>(
          'SELECT (SELECT count(*)::int FROM process.agent_message) AS messages, (SELECT count(*)::int FROM process.agent_message_outbox) AS outbox',
        );
        expect(result.rows[0]).toEqual({ messages: 3, outbox: 3 });
      } finally {
        await client.end();
      }
    } finally {
      await fixture.close();
    }
  });
});

// === L2: END-TO-END TESTS ===

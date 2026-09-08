import { describe, expect, it } from 'vitest';

import * as deliveryPackage from '../../index.js';
import { PostgresAgentMessageStore } from '@codex/db';
import { createAgentMessageDatabaseFixture } from '@codex/db/testing';
import { createControlledWssAppServer } from '../support/controlled-wss-app-server.js';

const message = {
  messageId: '00000000-0000-4000-8000-000000000551',
  correlationId: '00000000-0000-4000-8000-000000000552',
  kind: 'ask' as const,
  fromAgentId: 'agent-a',
  toAgentId: 'agent-b',
  body: 'question',
  state: 'queued' as const,
  marker: 'codex-message:00000000-0000-4000-8000-000000000551',
  hostId: 'remote',
  threadId: 'thread-b',
};

// === L2: REAL-BOUNDARY INTEGRATION TESTS ===
describe('[L2:INTEGRATION] pg-boss App Server message delivery', () => {
  it('settles a rejected controlled WSS prerequisite without leaking its listener', async () => {
    const activeListeners = () =>
      process
        .getActiveResourcesInfo()
        .filter((resource) => resource === 'TCPServerWrap').length;
    const listenersBefore = activeListeners();
    const startedAt = Date.now();

    await expect(
      createControlledWssAppServer({ credential: 'invalid-fixture-token' }),
    ).rejects.toThrow('App Server host authentication failed');
    await expect
      .poll(activeListeners, { timeout: 2_000, interval: 25 })
      .toBe(listenersBefore);
    expect(Date.now() - startedAt).toBeLessThan(5_000);
  }, 10_000);

  it('CAS05-L2-DELIVERY persists one pg-boss job and routes active delivery through expected-turn steer', async () => {
    const runtimeCandidate = (deliveryPackage as Record<string, unknown>)
      .AgentMessageDeliveryRuntime;
    const workerCandidate = (deliveryPackage as Record<string, unknown>)
      .createAgentMessageDeliveryWorker;
    expect(
      runtimeCandidate,
      'CAS-05 pg-boss message runtime is not implemented',
    ).toBeTypeOf('function');
    expect(
      workerCandidate,
      'CAS-05 App Server delivery worker is not implemented',
    ).toBeTypeOf('function');
    const fixture = await createAgentMessageDatabaseFixture();
    const runtime =
      new (runtimeCandidate as typeof deliveryPackage.AgentMessageDeliveryRuntime)(
        fixture.daemonUrl,
        fixture.ownerUrl,
      );
    try {
      await runtime.start();
      const store = new PostgresAgentMessageStore(fixture.daemonUrl, runtime);
      await store.register({
        agentId: 'agent-a',
        hostId: 'local',
        threadId: 'thread-a',
        sessionId: 'session-a',
      });
      await store.register({
        agentId: 'agent-b',
        hostId: 'remote',
        threadId: 'thread-b',
        sessionId: 'session-b',
      });
      const handle = await store.submit({
        kind: 'ask',
        idempotencyKey: 'ask-551',
        fromAgentId: 'agent-a',
        toAgentId: 'agent-b',
        body: 'question',
      });
      const [job] = await runtime.find(handle.messageId);
      expect(job?.data).toEqual({ messageId: handle.messageId });

      const requests: Array<{
        method: string;
        params?: Record<string, unknown>;
      }> = [];
      let reads = 0;
      const worker = (
        workerCandidate as typeof deliveryPackage.createAgentMessageDeliveryWorker
      )(
        {
          delivery: async () => ({
            ...message,
            messageId: handle.messageId,
            marker: `codex-message:${handle.messageId}`,
          }),
          mark: async () => undefined,
        } as never,
        {
          connect: async () => ({
            reconnect: async () => undefined,
            request: async (
              method: string,
              params?: Record<string, unknown>,
            ) => {
              requests.push({ method, params });
              if (method === 'thread/read') {
                reads += 1;
                return reads === 1
                  ? {
                      thread: {
                        status: { type: 'active' },
                        turns: [
                          {
                            id: 'turn-active',
                            status: 'inProgress',
                            items: [],
                          },
                        ],
                      },
                    }
                  : {
                      thread: {
                        status: { type: 'active' },
                        turns: [
                          {
                            id: 'turn-active',
                            status: 'inProgress',
                            items: [
                              {
                                type: 'userMessage',
                                clientId: handle.messageId,
                                content: [],
                              },
                            ],
                          },
                        ],
                      },
                    };
              }
              return { turnId: 'turn-active' };
            },
          }),
        } as never,
      );
      await worker(handle.messageId);
      expect(
        requests.find(({ method }) => method === 'turn/steer')?.params,
      ).toMatchObject({
        expectedTurnId: 'turn-active',
        clientUserMessageId: handle.messageId,
      });
      expect(requests.some(({ method }) => method === 'turn/start')).toBe(
        false,
      );
    } finally {
      await runtime.stop();
      await fixture.close();
    }
  });

  it('reconciles ambiguous acceptance by marker without a second mutating request', async () => {
    const marks: string[] = [];
    let reads = 0;
    let mutations = 0;
    let reconnects = 0;
    const worker = deliveryPackage.createAgentMessageDeliveryWorker(
      {
        delivery: async () => message,
        mark: async (_id: string, state: string) => void marks.push(state),
      } as never,
      {
        connect: async () => ({
          reconnect: async () => void (reconnects += 1),
          request: async (method: string) => {
            if (method === 'thread/read') {
              reads += 1;
              return reads === 1
                ? { thread: { status: { type: 'idle' }, turns: [] } }
                : {
                    thread: {
                      status: { type: 'idle' },
                      turns: [
                        {
                          items: [
                            {
                              type: 'userMessage',
                              clientId: message.messageId,
                              content: [],
                            },
                          ],
                        },
                      ],
                    },
                  };
            }
            mutations += 1;
            throw Object.assign(new Error('disconnect'), { ambiguous: true });
          },
        }),
      } as never,
    );
    await worker(message.messageId);
    expect({ mutations, reconnects, marks }).toEqual({
      mutations: 1,
      reconnects: 1,
      marks: ['thread-observed'],
    });
  });

  it('expires before host mutation', async () => {
    const marks: string[] = [];
    let connections = 0;
    const worker = deliveryPackage.createAgentMessageDeliveryWorker(
      {
        delivery: async () => ({
          ...message,
          expiresAt: new Date(0).toISOString(),
        }),
        mark: async (_id: string, state: string) => void marks.push(state),
      } as never,
      {
        connect: async () => {
          connections += 1;
          throw new Error('HOST_MUST_NOT_BE_CALLED');
        },
      } as never,
    );

    await worker(message.messageId);
    expect({ marks, connections }).toEqual({
      marks: ['expired'],
      connections: 0,
    });
  });

  it('delivers one visible message through a controlled authenticated WSS App Server', async () => {
    const fixture = await createControlledWssAppServer();
    try {
      const thread = await fixture.connection.startThread({
        model: 'gpt-5.6-sol',
        cwd: process.cwd(),
        approvalPolicy: 'never',
        sandbox: 'readOnly',
      });
      const remoteMessage = { ...message, threadId: thread.threadId };
      await fixture.connection
        .request('thread/list', {})
        .catch((error: unknown) => {
          const value = error as { providerCode?: number };
          throw new Error(
            `CONTROLLED_WSS_THREAD_LIST_FAILED:${value.providerCode ?? 'unknown'}`,
          );
        });
      const abort = new AbortController();
      const visible = new Set<string>();
      const remoteMarks: string[] = [];
      const feed = (async () => {
        for await (const event of fixture.connection.messages({
          signal: abort.signal,
        })) {
          if (event.kind === 'notification') {
            const params = event.params as {
              item?: { id?: string; type?: string; clientId?: string | null };
            };
            if (
              params.item?.type === 'userMessage' &&
              params.item.clientId === remoteMessage.messageId &&
              params.item.id
            ) {
              visible.add(params.item.id);
            }
          }
        }
      })();
      const worker = deliveryPackage.createAgentMessageDeliveryWorker(
        {
          delivery: async () => remoteMessage,
          mark: async (_id: string, state: string) =>
            void remoteMarks.push(state),
        } as never,
        { connect: async () => fixture.connection } as never,
      );

      await expect(worker(remoteMessage.messageId)).rejects.toThrow(
        'MESSAGE_OBSERVATION_PENDING',
      );
      await expect
        .poll(() => visible.size, { timeout: 15_000, interval: 100 })
        .toBe(1);
      await fixture.connection
        .request('thread/items/list', {
          threadId: thread.threadId,
          limit: 100,
          sortDirection: 'desc',
        })
        .catch((error: unknown) => {
          const value = error as { providerCode?: number };
          throw new Error(
            `CONTROLLED_WSS_THREAD_ITEMS_FAILED:${value.providerCode ?? 'unknown'}`,
          );
        });
      await worker(remoteMessage.messageId);
      expect(remoteMarks).toContain('thread-observed');
      abort.abort();
      await feed.catch((error: unknown) => {
        if (
          !error ||
          typeof error !== 'object' ||
          !('code' in error) ||
          error.code !== 'REQUEST_ABORTED'
        ) {
          throw error;
        }
      });
    } finally {
      await fixture.close();
    }
  });

  it('replays an offline queued message after broker and transport restart without a duplicate item', async () => {
    const database = await createAgentMessageDatabaseFixture();
    const wss = await createControlledWssAppServer();
    let runtime = new deliveryPackage.AgentMessageDeliveryRuntime(
      database.daemonUrl,
      database.ownerUrl,
    );
    try {
      await runtime.start();
      const thread = await wss.connection.startThread({
        model: 'gpt-5.6-sol',
        cwd: process.cwd(),
        approvalPolicy: 'never',
        sandbox: 'readOnly',
      });
      const store = new PostgresAgentMessageStore(database.daemonUrl, runtime);
      await store.register({
        agentId: 'offline-a',
        hostId: 'local',
        threadId: 'offline-local',
        sessionId: 'offline-local-session',
      });
      await store.register({
        agentId: 'offline-b',
        hostId: 'remote',
        threadId: thread.threadId,
        sessionId: thread.sessionId,
      });
      const command = {
        kind: 'send',
        idempotencyKey: 'offline-send-1',
        fromAgentId: 'offline-a',
        toAgentId: 'offline-b',
        body: 'offline durable delivery',
      } as const;
      const handle = await store.submit(command);
      await runtime.stop();
      await wss.connection.reconnect();

      runtime = new deliveryPackage.AgentMessageDeliveryRuntime(
        database.daemonUrl,
        database.ownerUrl,
      );
      await runtime.start();
      const restartedStore = new PostgresAgentMessageStore(
        database.daemonUrl,
        runtime,
      );
      await runtime.work(
        deliveryPackage.createAgentMessageDeliveryWorker(restartedStore, {
          connect: async () => wss.connection,
        }),
      );
      await expect
        .poll(
          async () => (await restartedStore.delivery(handle.messageId)).state,
          { timeout: 15_000, interval: 100 },
        )
        .toBe('thread-observed');
      await expect(restartedStore.submit(command)).resolves.toEqual({
        ...handle,
        state: 'thread-observed',
      });
      const items = await wss.connection.request<{
        data: Array<{
          item: { id?: string; type?: string; clientId?: string | null };
        }>;
      }>('thread/items/list', {
        threadId: thread.threadId,
        limit: 100,
        sortDirection: 'desc',
      });
      expect(
        new Set(
          items.data
            .filter(
              ({ item }) =>
                item.type === 'userMessage' &&
                item.clientId === handle.messageId,
            )
            .map(({ item }) => item.id),
        ).size,
      ).toBe(1);
    } finally {
      await runtime.stop().catch(() => undefined);
      await wss.close();
      await database.close();
    }
  });
});

// === L2: END-TO-END TESTS ===

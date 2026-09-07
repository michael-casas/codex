import { stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { createAgentMessenger } from '../agent-messaging.js';

/* eslint-disable @typescript-eslint/no-explicit-any -- compiled L3 boundary */

async function workspacePath(path: string): Promise<string> {
  let directory = process.cwd();
  while (true) {
    const candidate = resolve(directory, path);
    try {
      if ((await stat(candidate)).isFile()) return candidate;
    } catch {
      // Keep walking toward the filesystem root.
    }
    const parent = dirname(directory);
    if (parent === directory) throw new Error(`Cannot locate ${path}.`);
    directory = parent;
  }
}

async function workspaceModule(path: string): Promise<Record<string, any>> {
  return import(pathToFileURL(await workspacePath(path)).href) as Promise<
    Record<string, any>
  >;
}

async function waitFor(
  check: () => Promise<boolean>,
  timeoutMs = 15_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error('INTERCOM_WAIT_TIMEOUT');
}

export interface IntercomScenarioResult {
  readonly askCorrelationId: string;
  readonly replyCorrelationId: string;
  readonly pendingReplies: number;
  readonly visibleRemoteMessages: number;
  readonly replyReplayed: boolean;
}

export async function runIntercomScenario(): Promise<IntercomScenarioResult> {
  const [db, dbTesting, delivery, wssSupport] = await Promise.all([
    workspaceModule('packages/db/dist/index.js'),
    workspaceModule('packages/db/dist/testing.js'),
    workspaceModule('packages/delivery/dist/index.js'),
    workspaceModule(
      'packages/delivery/dist/agent-messaging/support/controlled-wss-app-server.js',
    ),
  ]);
  const database = await dbTesting.createAgentMessageDatabaseFixture();
  const wss = await wssSupport.createControlledWssAppServer();
  const runtime = new delivery.AgentMessageDeliveryRuntime(
    database.daemonUrl,
    database.ownerUrl,
  );
  const abort = new AbortController();
  const visible = new Set<string>();
  let result: IntercomScenarioResult | undefined;
  let cleanupFailure: AggregateError | undefined;
  const feed = (async () => {
    for await (const event of wss.connection.messages({
      signal: abort.signal,
    })) {
      const item = (
        event.params as {
          item?: { type?: string; id?: string; clientId?: string | null };
        }
      )?.item;
      if (
        event.kind === 'notification' &&
        item?.type === 'userMessage' &&
        typeof item.id === 'string' &&
        typeof item.clientId === 'string'
      ) {
        visible.add(`${item.clientId}:${item.id}`);
      }
    }
  })();
  try {
    await runtime.start();
    const remote = await wss.connection.startThread({
      model: 'gpt-5.6-sol',
      cwd: process.cwd(),
      approvalPolicy: 'never',
      sandbox: 'readOnly',
    });
    const store = new db.PostgresAgentMessageStore(database.daemonUrl, runtime);
    await store.register({
      agentId: 'agent-a',
      hostId: 'local',
      threadId: 'local-agent-a',
      sessionId: 'local-session-a',
    });
    await store.register({
      agentId: 'agent-b',
      hostId: 'remote',
      threadId: remote.threadId,
      sessionId: remote.sessionId,
    });
    const worker = delivery.createAgentMessageDeliveryWorker(store, {
      connect: async (hostId: string) => {
        if (hostId !== 'remote') throw new Error('LOCAL_DELIVERY_NOT_STARTED');
        return wss.connection;
      },
    });
    await runtime.work(worker);
    const messenger = createAgentMessenger(store);
    const ask = await messenger.ask(
      {
        idempotencyKey: 'l3-ask-1',
        fromAgentId: 'agent-a',
        toAgentId: 'agent-b',
        body: 'Reply with the correlated durable answer.',
      },
      { actorAgentId: 'agent-a', scopes: ['agent:message'] },
    );
    await waitFor(async () =>
      ['thread-observed', 'replied'].includes(
        (await store.delivery(ask.messageId)).state,
      ),
    );
    const replyInput = {
      idempotencyKey: 'l3-reply-1',
      fromAgentId: 'agent-b',
      toAgentId: 'agent-a',
      body: 'Correlated durable answer.',
      correlationId: ask.correlationId,
    } as const;
    const reply = await messenger.reply(replyInput, {
      actorAgentId: 'agent-b',
      scopes: ['agent:message'],
    });
    const replay = await messenger.reply(replyInput, {
      actorAgentId: 'agent-b',
      scopes: ['agent:message'],
    });
    await store.mark(reply.messageId, 'thread-observed');
    const pending = await messenger.pending({
      actorAgentId: 'agent-a',
      scopes: ['agent:message'],
    });
    const visibleForAsk = [...visible].filter((entry) =>
      entry.startsWith(`${ask.messageId}:`),
    ).length;
    result = {
      askCorrelationId: ask.correlationId,
      replyCorrelationId: reply.correlationId,
      pendingReplies: pending.filter(
        (message) => message.correlationId === ask.correlationId,
      ).length,
      visibleRemoteMessages: visibleForAsk,
      replyReplayed: replay.messageId === reply.messageId,
    };
  } finally {
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
    await runtime.stop().catch(() => undefined);
    const cleanup = await Promise.allSettled([wss.close(), database.close()]);
    const failures = cleanup
      .filter(
        (result): result is PromiseRejectedResult =>
          result.status === 'rejected',
      )
      .map(({ reason }) => reason);
    if (failures.length) {
      cleanupFailure = new AggregateError(
        failures,
        'Intercom fixture cleanup failed.',
      );
    }
  }
  if (cleanupFailure) throw cleanupFailure;
  if (!result) throw new Error('INTERCOM_RESULT_MISSING');
  return result;
}

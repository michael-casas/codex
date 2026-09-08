import { access, mkdtemp, rm, symlink } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import * as codex from '../../index.js';
import { connectAppServer } from '../app-server-client.client.js';

async function hostr1Client(scenario: string, maxMessageBytes?: number) {
  const fixture = fileURLToPath(
    new URL('../fixtures/controlled-app-server.mjs', import.meta.url),
  );
  return connectAppServer({
    command: process.execPath,
    versionArgs: [fixture, '--version'],
    serverArgs: [fixture],
    expectedVersion: '0.151.0',
    clientInfo: { name: 'hostr1', title: 'HOSTR1', version: '1' },
    env: { CAS01_SCENARIO: scenario, CAS01_TRACE_PATH: '' },
    ...(maxMessageBytes === undefined ? {} : { maxMessageBytes }),
    requestTimeoutMs: 1000,
    closeTimeoutMs: 500,
  });
}

// === L2: REAL-BOUNDARY INTEGRATION TESTS ===
describe('[L2:INTEGRATION] HOSTR1 synthetic finite framing', () => {
  it('keeps 2.25MiB events and responses usable within default budget', async () => {
    const client = await hostr1Client('hostr1-large');
    try {
      const result = await client.request<{ value: string }>('large');
      expect(result.value).toHaveLength(2_250_000);
      const event = await client.messages()[Symbol.asyncIterator]().next();
      expect(event.value).toMatchObject({ method: 'item/completed' });
      expect((event.value?.params as { value: string }).value).toHaveLength(
        2_250_000,
      );
      await expect(client.request('after')).resolves.toEqual({
        method: 'after',
      });
    } finally {
      await client.close();
    }
    expect(client.metrics()).toMatchObject({
      childExited: true,
      pendingRequests: 0,
    });
  });

  it('preserves explicit smaller inbound budget with safe typed details', async () => {
    const client = await hostr1Client('hostr1-large', 1024);
    try {
      await expect(client.request('large')).rejects.toMatchObject({
        code: 'MESSAGE_TOO_LARGE',
        limitBytes: 1024,
        retryable: false,
        observedBytes: expect.any(Number),
      });
    } finally {
      await client.close();
    }
    expect(client.metrics().childExited).toBe(true);
  });

  it('enforces configured outgoing budget and remains usable after rejection', async () => {
    const client = await hostr1Client('default', 1024);
    try {
      await expect(
        client.request('large', { value: 'x'.repeat(2000) }),
      ).rejects.toMatchObject({
        code: 'MESSAGE_TOO_LARGE',
        limitBytes: 1024,
        retryable: false,
      });
      await expect(client.request('after')).resolves.toEqual({
        method: 'after',
      });
    } finally {
      await client.close();
    }
    expect(client.metrics().childExited).toBe(true);
  });

  it.each(['hostr1-diagnostic', 'hostr1-diagnostic-eof-first'])(
    'preserves safe terminal diagnostics for %s',
    async (scenario) => {
      const client = await hostr1Client(scenario);
      try {
        await expect(client.request('trigger')).rejects.toMatchObject({
          code: 'MESSAGE_TOO_LARGE',
          observedBytes: 2_250_000,
          limitBytes: 1_048_576,
          retryable: false,
          details: {
            observedBytes: 2_250_000,
            limitBytes: 1_048_576,
            retryable: false,
          },
        });
      } finally {
        await client.close();
      }
      expect(client.metrics().childExited).toBe(true);
    },
  );

  it('discards oversized, unknown and malformed stderr without poisoning protocol', async () => {
    const client = await hostr1Client('hostr1-invalid-stderr');
    try {
      await expect(client.request('after')).resolves.toEqual({
        method: 'after',
      });
      expect(JSON.stringify(client.diagnostics)).not.toContain(
        'SECRET_DO_NOT_LEAK',
      );
      expect(client.metrics().failureCode).toBeUndefined();
    } finally {
      await client.close();
    }
    expect(client.metrics().childExited).toBe(true);
  });
});

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

interface RealClient {
  messages(): AsyncIterable<{
    kind: 'notification' | 'server-request';
    id?: number | string;
    method: string;
    params: Json;
  }>;
  startThread(params: {
    model: string;
    cwd: string;
    approvalPolicy: 'never';
    sandbox: 'readOnly' | 'dangerFullAccess';
  }): Promise<{ threadId: string; sessionId: string }>;
  startTurn(params: {
    threadId: string;
    input: Array<{ type: 'text'; text: string }>;
    model: string;
    effort: 'medium';
  }): Promise<{ turnId: string }>;
  interruptTurn(params: { threadId: string; turnId: string }): Promise<void>;
  close(): Promise<void>;
  metrics(): {
    pendingRequests: number;
    bufferedMessages: number;
    closed: boolean;
    childExited: boolean;
  };
}

type Connect = (options: {
  expectedVersion: string;
  clientInfo: { name: string; title: string; version: string };
  env: NodeJS.ProcessEnv;
  requestTimeoutMs: number;
  closeTimeoutMs: number;
}) => Promise<RealClient>;

const cleanup = new Set<string>();

afterEach(async () => {
  await Promise.all(
    [...cleanup].map(async (path) => {
      cleanup.delete(path);
      await rm(path, { recursive: true, force: true });
    }),
  );
});

function connector(): Connect {
  const candidate = (codex as Record<string, unknown>).connectAppServer;
  expect(candidate, 'CAS-01 connect behavior is not implemented').toBeTypeOf(
    'function',
  );
  if (typeof candidate !== 'function')
    throw new Error('CONNECT_NOT_IMPLEMENTED');
  return candidate as Connect;
}

async function testHome(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cas01-real-app-server-'));
  cleanup.add(root);
  const sourceHome = process.env.CODEX_HOME ?? join(homedir(), '.codex');
  const auth = join(sourceHome, 'auth.json');
  try {
    await access(auth);
    await symlink(auth, join(root, 'auth.json'));
  } catch {
    // The installed CLI may use platform credential storage instead.
  }
  return root;
}

async function connectReal(): Promise<{ client: RealClient; cwd: string }> {
  const connect = connector();
  const codexHome = await testHome();
  return {
    cwd: process.cwd(),
    client: await connect({
      expectedVersion: '0.151.0',
      clientInfo: {
        name: 'cas01_l2',
        title: 'CAS-01 L2',
        version: '0.151.0',
      },
      env: { ...process.env, CODEX_HOME: codexHome },
      requestTimeoutMs: 30_000,
      closeTimeoutMs: 2_000,
    }),
  };
}

function observeTurn(
  client: RealClient,
  turnId: string,
): { started: Promise<void>; completed: Promise<string[]> } {
  let resolveStarted!: () => void;
  let rejectStarted!: (cause: unknown) => void;
  const started = new Promise<void>((resolve, reject) => {
    resolveStarted = resolve;
    rejectStarted = reject;
  });
  const completed = (async () => {
    const methods: string[] = [];
    try {
      for await (const message of client.messages()) {
        methods.push(message.method);
        const id = (message.params as { turn?: { id?: string } }).turn?.id;
        if (message.method === 'turn/started' && id === turnId)
          resolveStarted();
        if (message.method === 'turn/completed' && id === turnId)
          return methods;
      }
      throw new Error('APP_SERVER_FEED_ENDED_BEFORE_TURN_COMPLETED');
    } catch (cause) {
      rejectStarted(cause);
      throw cause;
    }
  })();
  return { started, completed };
}

describe('[L2:INTEGRATION] real App Server stdio client', () => {
  it('[L2:INTEGRATION] CAS01-L2-REAL-STREAM starts a real thread and turn and streams delta through terminal completion', async () => {
    const { client, cwd } = await connectReal();
    try {
      const thread = await client.startThread({
        model: 'gpt-5.6-luna',
        cwd,
        approvalPolicy: 'never',
        sandbox: 'readOnly',
      });
      expect(thread.threadId).toBeTruthy();
      expect(thread.sessionId).toBeTruthy();

      const turn = await client.startTurn({
        threadId: thread.threadId,
        input: [
          {
            type: 'text',
            text: 'Reply with exactly CAS01_OK and do not call tools.',
          },
        ],
        model: 'gpt-5.6-luna',
        effort: 'medium',
      });
      const methods = await observeTurn(client, turn.turnId).completed;
      expect(methods).toContain('item/agentMessage/delta');
      expect(methods).toContain('item/completed');
      expect(methods.at(-1)).toBe('turn/completed');
    } finally {
      await client.close();
    }
    expect(client.metrics()).toMatchObject({
      pendingRequests: 0,
      bufferedMessages: 0,
      closed: true,
      childExited: true,
    });
  }, 120_000);

  it('[L2:INTEGRATION] CAS01-L2-REAL-INTERRUPT interrupts a real active turn and closes every owned resource', async () => {
    const { client, cwd } = await connectReal();
    try {
      const thread = await client.startThread({
        model: 'gpt-5.6-luna',
        cwd,
        approvalPolicy: 'never',
        sandbox: 'dangerFullAccess',
      });
      const turn = await client.startTurn({
        threadId: thread.threadId,
        input: [
          {
            type: 'text',
            text: 'Use the shell to run sleep 20, then reply done.',
          },
        ],
        model: 'gpt-5.6-luna',
        effort: 'medium',
      });
      const observation = observeTurn(client, turn.turnId);
      await observation.started;
      await client.interruptTurn({
        threadId: thread.threadId,
        turnId: turn.turnId,
      });
      const methods = await observation.completed;
      expect(
        methods.filter((method) => method === 'turn/completed'),
      ).toHaveLength(1);
    } finally {
      await client.close();
    }
    expect(client.metrics()).toMatchObject({
      pendingRequests: 0,
      bufferedMessages: 0,
      closed: true,
      childExited: true,
    });
  }, 120_000);
});

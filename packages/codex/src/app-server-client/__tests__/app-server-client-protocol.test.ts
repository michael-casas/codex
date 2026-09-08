import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import * as codex from '../../index.js';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type RequestId = number | string;

interface TestClient {
  request<T extends Json = Json>(
    method: string,
    params?: Json,
    options?: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<T>;
  messages(options?: {
    signal?: AbortSignal;
  }): AsyncIterable<
    | { kind: 'notification'; method: string; params: Json }
    | { kind: 'server-request'; id: RequestId; method: string; params: Json }
  >;
  respond(
    id: RequestId,
    response: { result: Json } | { error: { code: number; message: string } },
  ): Promise<void>;
  close(): Promise<void>;
  metrics(): {
    pendingRequests: number;
    bufferedMessages: number;
    canceledResponses: number;
    closed: boolean;
    childExited: boolean;
    failureCode?: string;
  };
}

interface ConnectOptions {
  command: string;
  versionArgs: string[];
  serverArgs: string[];
  expectedVersion: string;
  clientInfo: { name: string; title: string; version: string };
  env: NodeJS.ProcessEnv;
  maxBufferedMessages?: number;
  maxMessageBytes?: number;
  requestTimeoutMs?: number;
  closeTimeoutMs?: number;
}

type Connect = (options: ConnectOptions) => Promise<TestClient>;

const fixture = fileURLToPath(
  new URL('../fixtures/controlled-app-server.mjs', import.meta.url),
);
const cleanup = new Set<string>();

describe('HOSTR1 finite client policy', () => {
  it.each([64 * 1024 * 1024 + 1, Infinity, 0, 1.5])(
    'rejects invalid byte limit %s before any child launch',
    async (maxMessageBytes) => {
      const { options, tracePath } = await harness('default', {
        maxMessageBytes,
      });
      const outcome = await connector()(options).then(
        async (client) => {
          await client.close();
          return { code: 'UNEXPECTED_CONNECTION' };
        },
        (cause: unknown) => cause,
      );
      expect(outcome).toMatchObject({ code: 'INVALID_OPTIONS' });
      await expect(readFile(tracePath)).rejects.toMatchObject({
        code: 'ENOENT',
      });
    },
  );
});

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

async function harness(
  scenario: string,
  overrides: Partial<ConnectOptions> = {},
): Promise<{ options: ConnectOptions; tracePath: string }> {
  const root = await mkdtemp(join(tmpdir(), 'cas01-controlled-'));
  cleanup.add(root);
  const tracePath = join(root, 'trace.jsonl');
  return {
    tracePath,
    options: {
      command: process.execPath,
      versionArgs: [fixture, '--version'],
      serverArgs: [fixture],
      expectedVersion: '0.151.0',
      clientInfo: {
        name: 'cas01_test',
        title: 'CAS-01 Test',
        version: '0.151.0',
      },
      env: {
        CAS01_SCENARIO: scenario,
        CAS01_TRACE_PATH: tracePath,
      },
      requestTimeoutMs: 500,
      closeTimeoutMs: 500,
      ...overrides,
    },
  };
}

async function trace(path: string): Promise<Array<Record<string, unknown>>> {
  const value = await readFile(path, 'utf8');
  return value
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ code });
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 500,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('WAIT_TIMEOUT');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

// === L1: UNIT TESTS ===
describe('[L1:UNIT] App Server client protocol', () => {
  it('[L1:UNIT] CAS01-L1-INITIALIZE-VERSION initializes exactly once after exact CLI version admission', async () => {
    const connect = connector();
    const admitted = await harness('default');
    const client = await connect(admitted.options);
    await client.close();

    const received = (await trace(admitted.tracePath)).filter(
      (entry) => entry.type === 'receive',
    );
    expect(received).toHaveLength(2);
    expect(
      received.map((entry) => (entry.message as { method: string }).method),
    ).toEqual(['initialize', 'initialized']);

    const rejected = await harness('default');
    rejected.options.env.CAS01_VERSION = '0.150.0';
    await expectCode(connect(rejected.options), 'VERSION_MISMATCH');
    expect(
      (await trace(rejected.tracePath)).map((entry) => entry.type),
    ).toEqual(['version']);
  });

  it('[L1:UNIT] CAS01-L1-CORRELATION resolves concurrent out-of-order responses and fails closed on unmatched IDs', async () => {
    const connect = connector();
    const ordered = await harness('out-of-order');
    const client = await connect(ordered.options);
    const first = client.request<{ method: string }>('test/first', {});
    const second = client.request<{ method: string }>('test/second', {});
    await expect(Promise.all([first, second])).resolves.toEqual([
      { method: 'test/first' },
      { method: 'test/second' },
    ]);
    await client.close();

    const unmatched = await harness('unmatched');
    const invalid = await connect(unmatched.options);
    await expectCode(
      invalid.request('test/unmatched', {}),
      'UNMATCHED_RESPONSE',
    );
    expect(invalid.metrics()).toMatchObject({
      closed: true,
      pendingRequests: 0,
      failureCode: 'UNMATCHED_RESPONSE',
    });
    await invalid.close();
  });

  it('[L1:UNIT] CAS01-L1-PROVIDER-ERROR maps provider failures without leaking provider messages or secrets', async () => {
    const connect = connector();
    const controlled = await harness('provider-error');
    const client = await connect(controlled.options);
    let failure: unknown;
    try {
      await client.request('test/provider-error', {
        token: 'CLIENT_SECRET_DO_NOT_LEAK',
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({
      code: 'REQUEST_FAILED',
      providerCode: -32_042,
      method: 'test/provider-error',
    });
    expect(String(failure)).not.toContain('CAS01_DO_NOT_LEAK');
    expect(JSON.stringify(failure)).not.toContain('CLIENT_SECRET_DO_NOT_LEAK');
    await client.close();
  });

  it('[L1:UNIT] CAS01-L1-INBOUND-BOUNDS exposes notifications and server requests through one bounded feed', async () => {
    const connect = connector();
    const controlled = await harness('inbound', { maxBufferedMessages: 2 });
    const client = await connect(controlled.options);
    const iterator = client.messages()[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toMatchObject({
      value: { kind: 'notification', method: 'future/notification' },
    });
    const request = await iterator.next();
    expect(request).toMatchObject({
      value: {
        kind: 'server-request',
        id: 'server-1',
        method: 'item/tool/requestUserInput',
      },
    });
    if (!request.done && request.value.kind === 'server-request') {
      await client.respond(request.value.id, { result: { answers: [] } });
    }
    await iterator.return?.();
    await client.close();

    const overflow = await harness('overflow', { maxBufferedMessages: 1 });
    const bounded = await connect(overflow.options);
    await waitFor(() => bounded.metrics().closed);
    expect(bounded.metrics()).toMatchObject({
      bufferedMessages: 0,
      failureCode: 'BACKPRESSURE',
    });
    await bounded.close();
  });

  it('[L1:UNIT] CAS01-L1-MALFORMED-LIMIT rejects malformed or oversized JSONL without echoing content', async () => {
    const connect = connector();
    const malformed = await harness('malformed');
    const malformedClient = await connect(malformed.options);
    let malformedFailure: unknown;
    try {
      await malformedClient.request('test/malformed', {});
    } catch (error) {
      malformedFailure = error;
    }
    expect(malformedFailure).toMatchObject({ code: 'MALFORMED_MESSAGE' });
    expect(String(malformedFailure)).not.toContain('not-json');
    await malformedClient.close();

    const oversized = await harness('oversized', { maxMessageBytes: 1024 });
    const oversizedClient = await connect(oversized.options);
    await expectCode(
      oversizedClient.request('test/oversized', {}),
      'MESSAGE_TOO_LARGE',
    );
    await oversizedClient.close();
  });

  it('[L1:UNIT] CAS01-L1-CANCEL-EOF distinguishes local cancellation from ambiguous EOF and drains safely', async () => {
    const connect = connector();
    const delayed = await harness('delayed');
    const client = await connect(delayed.options);
    const preAborted = new AbortController();
    preAborted.abort();
    await expectCode(
      client.request('test/pre-abort', {}, { signal: preAborted.signal }),
      'REQUEST_ABORTED',
    );

    const active = new AbortController();
    const pending = client.request(
      'test/active-abort',
      {},
      {
        signal: active.signal,
      },
    );
    active.abort();
    await expectCode(pending, 'REQUEST_ABORTED');
    await new Promise((resolve) => setTimeout(resolve, 60));
    await expect(client.request('test/after-abort', {})).resolves.toEqual({
      method: 'test/after-abort',
    });
    expect(client.metrics()).toMatchObject({
      pendingRequests: 0,
      canceledResponses: 0,
      closed: false,
    });
    const methods = (await trace(delayed.tracePath))
      .filter((entry) => entry.type === 'receive')
      .map((entry) => (entry.message as { method: string }).method);
    expect(methods).not.toContain('test/pre-abort');
    await client.close();

    const eof = await harness('eof');
    const eofClient = await connect(eof.options);
    await expect(eofClient.request('test/eof', {})).rejects.toMatchObject({
      code: 'CONNECTION_CLOSED',
      ambiguous: true,
    });
    await eofClient.close();
    expect(eofClient.metrics()).toMatchObject({
      pendingRequests: 0,
      bufferedMessages: 0,
      closed: true,
      childExited: true,
    });
  });
});

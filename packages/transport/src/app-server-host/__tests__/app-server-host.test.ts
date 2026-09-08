import { describe, expect, it, vi } from 'vitest';

import * as transport from '../../index.js';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

interface TestClient {
  readonly diagnostics: { serverVersion: string };
  request(method: string, params?: Json): Promise<Json>;
  messages(): AsyncIterable<never>;
  close(): Promise<void>;
  metrics(): { closed: boolean };
}

interface ConnectorOptions {
  maxMessageBytes?: number;
  command?: string;
  versionArgs?: readonly string[];
  serverArgs?: readonly string[];
  expectedVersion: string;
  env?: NodeJS.ProcessEnv;
}

type Connector = (options: ConnectorOptions) => Promise<TestClient>;

type HostInput =
  | {
      hostId: string;
      transport: 'local-proxy';
      expectedVersion: string;
      codexHome?: string;
      socketPath?: string;
      requiredCapabilities?: string[];
      [key: string]: unknown;
    }
  | {
      hostId: string;
      transport: 'remote-wss';
      endpoint: string;
      credentialRef: string;
      expectedVersion: string;
      caCertificatePath?: string;
      requiredCapabilities?: string[];
      [key: string]: unknown;
    };

interface HostConnection extends TestClient {
  readonly hostId: string;
  reconnect(): Promise<void>;
  subscribe(key: string, method: string, params?: Json): Promise<Json>;
  hostMetrics(): {
    reconnectAttempts: number;
    subscriptions: number;
    closed: boolean;
  };
}

interface HostRegistry {
  register(input: HostInput): {
    hostId: string;
    transport: HostInput['transport'];
    endpoint: string;
    expectedVersion: string;
    enabled: boolean;
    capabilities: string[];
  };
  read(hostId: string): Record<string, unknown> | undefined;
  connect(hostId: string): Promise<HostConnection>;
  health(hostId: string): Promise<{
    available: boolean;
    serverVersion: string;
    capabilities: string[];
  }>;
  disable(hostId: string): Promise<void>;
}

interface RegistryOptions {
  maxMessageBytes?: number;
  connectAppServer: Connector;
  resolveCredential(ref: string): Promise<string>;
  bunCommand?: string;
  bridgePath?: string;
  maxReconnectAttempts?: number;
  reconnectBaseDelayMs?: number;
  reconnectMaxDelayMs?: number;
  random?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

type CreateRegistry = (options: RegistryOptions) => HostRegistry;

function factory(): CreateRegistry {
  const candidate = (transport as Record<string, unknown>)
    .createAppServerHostRegistry;
  expect(
    candidate,
    'CAS-02 host registry behavior is not implemented',
  ).toBeTypeOf('function');
  if (typeof candidate !== 'function')
    throw new Error('REGISTRY_NOT_IMPLEMENTED');
  return candidate as CreateRegistry;
}

function fakeClient(
  request: TestClient['request'] = async () => ({ ok: true }),
): TestClient & { close: ReturnType<typeof vi.fn> } {
  const close = vi.fn(async () => undefined);
  return {
    diagnostics: { serverVersion: '0.151.0' },
    request,
    async *messages() {
      yield* [];
    },
    close,
    metrics: () => ({ closed: close.mock.calls.length > 0 }),
  };
}

function options(
  connector: Connector = async () => fakeClient(),
  overrides: Partial<RegistryOptions> = {},
): RegistryOptions {
  return {
    connectAppServer: connector,
    resolveCredential: async () => 'CAS02_SECRET_DO_NOT_LEAK',
    bunCommand: '/usr/local/bin/bun',
    bridgePath: '/opt/codex/app-server-wss-bridge.ts',
    maxReconnectAttempts: 3,
    reconnectBaseDelayMs: 10,
    reconnectMaxDelayMs: 40,
    random: () => 0,
    sleep: async () => undefined,
    ...overrides,
  };
}

const localHost: HostInput = {
  hostId: 'local-main',
  transport: 'local-proxy',
  expectedVersion: '0.151.0',
  codexHome: '/tmp/cas02-home',
  socketPath: '/tmp/cas02-app-server.sock',
  requiredCapabilities: ['thread-events'],
};

const remoteHost: HostInput = {
  hostId: 'remote-main',
  transport: 'remote-wss',
  endpoint: 'wss://remote.example.test:4500',
  credentialRef: 'remote-main-token',
  expectedVersion: '0.151.0',
  caCertificatePath: '/tmp/cas02-ca.pem',
  requiredCapabilities: ['thread-events'],
};

// === L1: UNIT TESTS ===
describe('[L1:UNIT] local CLI compatibility', () => {
  it('admits exact local 0.153.2 without widening remote or unknown versions', async () => {
    const connector = vi.fn<Connector>(async () => fakeClient());
    const registry = factory()(options(connector));
    registry.register({ ...localHost, expectedVersion: '0.153.2' });
    await registry.connect(localHost.hostId);
    expect(connector.mock.calls[0]?.[0]).toMatchObject({
      expectedVersion: '0.153.2',
    });
    expectCode(
      () => registry.register({ ...remoteHost, expectedVersion: '0.153.2' }),
      'VERSION_MISMATCH',
    );
    expectCode(
      () =>
        registry.register({
          ...localHost,
          hostId: 'unknown',
          expectedVersion: '0.154.0',
        }),
      'VERSION_MISMATCH',
    );
    await registry.disable(localHost.hostId);
  });
});

describe('[L1:UNIT] HOSTR1 host message policy', () => {
  it('HOSTR1 propagates finite message budgets to bridge and client', async () => {
    const connector = vi.fn(async (input: ConnectorOptions) => {
      void input;
      return fakeClient();
    });
    const registry = factory()(options(connector, { maxMessageBytes: 4096 }));
    registry.register(remoteHost);
    await registry.connect('remote-main');
    expect(connector.mock.calls[0]?.[0]?.maxMessageBytes).toBe(4096);
    expect(
      connector.mock.calls[0]?.[0]?.serverArgs?.includes(
        '--max-message-bytes=4096',
      ),
    ).toBe(true);
    await registry.disable('remote-main');
  });
  it('HOSTR1 keeps deterministic oversized errors typed and sanitized', async () => {
    const registry = factory()(
      options(async () =>
        fakeClient(async () => {
          throw {
            code: 'MESSAGE_TOO_LARGE',
            ambiguous: true,
            observedBytes: 5000,
            limitBytes: 4096,
            retryable: false,
            secret: 'must-not-leak',
          };
        }),
      ),
    );
    registry.register(localHost);
    const client = await registry.connect('local-main');
    await expect(client.request('thread/read')).rejects.toMatchObject({
      code: 'MESSAGE_TOO_LARGE',
      observedBytes: 5000,
      limitBytes: 4096,
      retryable: false,
      method: 'thread/read',
    });
    await client
      .request('thread/read')
      .catch((error) =>
        expect(JSON.stringify(error)).not.toContain('must-not-leak'),
      );
    await registry.disable('local-main');
  });
  it.each([0, -1, 1.5, 67108865])(
    'HOSTR1 rejects invalid registry budget %s',
    (maxMessageBytes) => {
      expectCode(
        () => factory()(options(undefined, { maxMessageBytes })),
        'INVALID_HOST',
      );
    },
  );
});

function expectCode(action: () => unknown, code: string): void {
  expect(action).toThrow(expect.objectContaining({ code }));
}

describe('[L1:UNIT] App Server host admission', () => {
  it('[L1:UNIT] CAS02-L1-ADMISSION admits local proxy and remote WSS hosts with idempotent registration', () => {
    const registry = factory()(options());
    const local = registry.register(localHost);
    const remote = registry.register(remoteHost);

    expect(registry.register({ ...localHost })).toBe(local);
    expect(registry.register({ ...remoteHost })).toBe(remote);
    expectCode(
      () => registry.register({ ...remoteHost, endpoint: 'wss://other.test' }),
      'HOST_CONFLICT',
    );
    expect(registry.read('remote-main')).toEqual(remote);
    expect(JSON.stringify(remote)).not.toContain('remote-main-token');
    expect(remote).toMatchObject({
      transport: 'remote-wss',
      endpoint: 'wss://remote.example.test:4500/',
      enabled: true,
    });
  });

  it('[L1:UNIT] CAS02-L1-SECURITY rejects plaintext, embedded credentials, raw-secret fields, and unsafe local sockets', () => {
    const create = factory();
    const secret = 'CAS02_RAW_SECRET';
    const invalid: HostInput[] = [
      { ...remoteHost, endpoint: 'ws://remote.example.test:4500' },
      {
        ...remoteHost,
        endpoint: 'wss://user:password@remote.example.test:4500',
      },
      {
        ...remoteHost,
        endpoint: 'wss://remote.example.test:4500/?token=secret',
      },
      { ...remoteHost, token: secret },
      { ...remoteHost, credentialRef: 'bad ref' },
      { ...localHost, socketPath: 'relative.sock' },
    ];

    for (const host of invalid) {
      const registry = create(options());
      let failure: unknown;
      try {
        registry.register(host);
      } catch (error) {
        failure = error;
      }
      expect(failure).toMatchObject({ code: 'INVALID_HOST' });
      expect(String(failure)).not.toContain(secret);
      expect(JSON.stringify(failure)).not.toContain(secret);
      expect(registry.read(host.hostId)).toBeUndefined();
    }
  });

  it('[L1:UNIT] CAS02-L1-VERSION-CAPABILITY-DISABLE fails closed on incompatible hosts and disables active connections', async () => {
    const client = fakeClient();
    const registry = factory()(options(async () => client));

    expectCode(
      () => registry.register({ ...localHost, expectedVersion: '0.150.0' }),
      'VERSION_MISMATCH',
    );
    expectCode(
      () =>
        registry.register({
          ...localHost,
          requiredCapabilities: ['future-capability'],
        }),
      'CAPABILITY_MISMATCH',
    );

    registry.register(localHost);
    await registry.connect('local-main');
    await registry.disable('local-main');
    await registry.disable('local-main');
    expect(client.close).toHaveBeenCalledTimes(1);
    await expect(registry.connect('local-main')).rejects.toMatchObject({
      code: 'HOST_DISABLED',
    });
    await expect(registry.health('local-main')).rejects.toMatchObject({
      code: 'HOST_DISABLED',
    });
  });

  it('[L1:UNIT] CAS02-L1-CONNECT-ROUTING routes local proxy and remote WSS through CAS-01 without leaking secrets', async () => {
    const calls: ConnectorOptions[] = [];
    const connector: Connector = async (call) => {
      calls.push(call);
      return fakeClient();
    };
    const registry = factory()(options(connector));
    registry.register(localHost);
    registry.register(remoteHost);

    const local = await registry.connect('local-main');
    const remote = await registry.connect('remote-main');
    expect(calls[0]).toMatchObject({
      command: 'codex',
      serverArgs: [
        'app-server',
        'proxy',
        '--sock',
        '/tmp/cas02-app-server.sock',
      ],
      expectedVersion: '0.151.0',
      env: { CODEX_HOME: '/tmp/cas02-home' },
    });
    expect(calls[1]).toMatchObject({
      command: '/usr/local/bin/bun',
      expectedVersion: '0.151.0',
      env: { CAS02_REMOTE_TOKEN: 'CAS02_SECRET_DO_NOT_LEAK' },
    });
    expect(calls[1]?.versionArgs).toContain(
      '/opt/codex/app-server-wss-bridge.ts',
    );
    expect(calls[1]?.serverArgs).toContain('wss://remote.example.test:4500/');
    expect(JSON.stringify(calls[1]?.versionArgs)).not.toContain(
      'CAS02_SECRET_DO_NOT_LEAK',
    );
    expect(JSON.stringify(calls[1]?.serverArgs)).not.toContain(
      'CAS02_SECRET_DO_NOT_LEAK',
    );
    expect(JSON.stringify(registry.read('remote-main'))).not.toContain(
      'CAS02_SECRET_DO_NOT_LEAK',
    );
    await local.close();
    await remote.close();
  });
});

// === L1: IN-PROCESS INTEGRATION TESTS ===
describe('[L1:INTEGRATION] App Server host reconnect', () => {
  it('[L1:INTEGRATION] CAS02-L1-RECONNECT bounds overload retry and restores unique subscriptions after reconnect', async () => {
    const delays: number[] = [];
    const firstRequests: string[] = [];
    const secondRequests: string[] = [];
    const first = fakeClient(async (method) => {
      firstRequests.push(method);
      return { subscribed: true };
    });
    const second = fakeClient(async (method) => {
      secondRequests.push(method);
      return { subscribed: true };
    });
    const clients = [first, second];
    const registry = factory()(
      options(async () => clients.shift() ?? fakeClient(), {
        sleep: async (ms) => {
          delays.push(ms);
        },
      }),
    );
    registry.register(localHost);
    const connection = await registry.connect('local-main');

    await connection.subscribe('thread:one', 'thread/resume', {
      threadId: 'thread-one',
      excludeTurns: true,
    });
    await connection.subscribe('thread:one', 'thread/resume', {
      threadId: 'thread-one',
      excludeTurns: true,
    });
    expect(firstRequests).toEqual(['thread/resume']);

    await connection.reconnect();
    expect(first.close).toHaveBeenCalledTimes(1);
    expect(secondRequests).toEqual(['thread/resume']);
    expect(connection.hostMetrics()).toMatchObject({
      reconnectAttempts: 1,
      subscriptions: 1,
      closed: false,
    });

    let overloadCalls = 0;
    const overload = fakeClient(async () => {
      overloadCalls += 1;
      if (overloadCalls === 1) {
        throw { code: 'REQUEST_FAILED', providerCode: -32_001 };
      }
      return { ok: true };
    });
    const overloadRegistry = factory()(
      options(async () => overload, {
        sleep: async (ms) => {
          delays.push(ms);
        },
      }),
    );
    overloadRegistry.register({ ...localHost, hostId: 'overload' });
    const overloaded = await overloadRegistry.connect('overload');
    await expect(overloaded.request('account/read', {})).resolves.toEqual({
      ok: true,
    });
    expect(overloadCalls).toBe(2);

    let ambiguousCalls = 0;
    const ambiguous = fakeClient(async () => {
      ambiguousCalls += 1;
      throw { code: 'CONNECTION_CLOSED', ambiguous: true };
    });
    const ambiguousRegistry = factory()(options(async () => ambiguous));
    ambiguousRegistry.register({ ...localHost, hostId: 'ambiguous' });
    const disconnected = await ambiguousRegistry.connect('ambiguous');
    await expect(disconnected.request('turn/start', {})).rejects.toMatchObject({
      code: 'HOST_CONNECTION_LOST',
      ambiguous: true,
    });
    expect(ambiguousCalls).toBe(1);
    expect(delays).toEqual([10, 10]);

    await connection.close();
    await overloaded.close();
    await disconnected.close();
  });
});

import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import {
  connect as connectTcp,
  createServer as createTcpServer,
} from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  createServer as createTlsServer,
  type Server as TlsServer,
  type TLSSocket,
} from 'node:tls';

import {
  APP_SERVER_PROTOCOL_VERSION,
  connectAppServer,
  type AppServerClient,
  type AppServerClientOptions,
  type AppServerJson,
} from '@codex/codex';
import { afterEach, describe, expect, it } from 'vitest';

import * as transport from '../../index.js';
import { runUnixBridgeFixture } from '../support/host-message-limit.fixture.js';

// === L2: REAL-BOUNDARY INTEGRATION TESTS ===
describe('[L2:INTEGRATION] HOSTR1 synthetic Unix framing', () => {
  it.each([undefined, '1024'])(
    'HOSTR1 synthetic TLS WSS observes shared budget %s',
    async (limit) => {
      const result = await runUnixBridgeFixture({
        payloadBytes: 2250000,
        wss: true,
        limit,
      });
      expect(result.exitedNaturally).toBe(true);
      expect(result.code).toBe(limit ? 1 : 0);
      expect(
        result.outputBytes === (limit ? 0 : result.expectedOutputBytes),
      ).toBe(true);
      if (limit)
        expect(result.stderr.startsWith('CODEX_BRIDGE_DIAGNOSTIC:')).toBe(true);
    },
  );
  it('HOSTR1 accepts a 2.25MiB media-shaped message and closes after server EOF', async () => {
    const result = await runUnixBridgeFixture({ payloadBytes: 2250000 });
    expect(result.outputBytes === result.expectedOutputBytes).toBe(true);
    expect(result).toMatchObject({ exitedNaturally: true, code: 0 });
  });

  it.each([false, true])(
    'HOSTR1 rejects oversized message with bounded typed provenance; fragmented=%s',
    async (fragmented) => {
      const result = await runUnixBridgeFixture({
        payloadBytes: 1500,
        limit: '1024',
        fragmented,
      });
      expect(result).toMatchObject({
        code: 1,
        exitedNaturally: true,
        outputBytes: 0,
      });
      const diagnostic = JSON.parse(
        result.stderr.trim().replace(/^CODEX_BRIDGE_DIAGNOSTIC:/, ''),
      );
      expect(diagnostic).toEqual({
        code: 'MESSAGE_TOO_LARGE',
        observedBytes: result.payloadBytes,
        limitBytes: 1024,
        retryable: false,
      });
      expect(result.stderr.length).toBeLessThan(512);
    },
  );

  it('HOSTR1 rejects invalid configured budget before connection', async () => {
    const result = await runUnixBridgeFixture({ payloadBytes: 10, limit: '0' });
    expect(result).toMatchObject({
      exitedNaturally: true,
      code: 1,
      connections: 0,
    });
    expect(result.stderr).toContain('APP_SERVER_UNIX_BRIDGE_INVALID');
  });
});

type Connector = (options: AppServerClientOptions) => Promise<AppServerClient>;

interface HostConnection {
  request<T extends AppServerJson = AppServerJson>(
    method: string,
    params?: AppServerJson,
  ): Promise<T>;
  subscribe<T extends AppServerJson = AppServerJson>(
    key: string,
    method: string,
    params?: AppServerJson,
  ): Promise<T>;
  startThread(params: {
    model: string;
    cwd: string;
    approvalPolicy: 'never';
    sandbox: 'readOnly';
  }): Promise<{ threadId: string; sessionId: string }>;
  reconnect(): Promise<void>;
  close(): Promise<void>;
  hostMetrics(): {
    reconnectAttempts: number;
    subscriptions: number;
    closed: boolean;
  };
}

interface HostRegistry {
  register(input: Record<string, unknown>): unknown;
  connect(hostId: string): Promise<HostConnection>;
  health(hostId: string): Promise<{
    available: boolean;
    serverVersion: string;
  }>;
  restart(hostId: string): Promise<void>;
  disable(hostId: string): Promise<void>;
}

type CreateRegistry = (options: {
  connectAppServer: Connector;
  resolveCredential(ref: string): Promise<string>;
  maxReconnectAttempts?: number;
  reconnectBaseDelayMs?: number;
  reconnectMaxDelayMs?: number;
}) => HostRegistry;

const execFileAsync = promisify(execFile);
const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()?.();
});

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

async function testHome(prefix: string): Promise<string> {
  const root = await mkdtemp(join('/tmp', prefix));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  const sourceHome = process.env.CODEX_HOME ?? join(homedir(), '.codex');
  const auth = join(sourceHome, 'auth.json');
  try {
    await access(auth);
    await symlink(auth, join(root, 'auth.json'));
  } catch {
    // The installed CLI may use platform credential storage instead.
  }
  const standalone = join(sourceHome, 'packages', 'standalone');
  try {
    await access(standalone);
    await mkdir(join(root, 'packages'), { recursive: true });
    await symlink(standalone, join(root, 'packages', 'standalone'));
  } catch {
    // The local-daemon test will report the missing managed install faithfully.
  }
  return root;
}

async function freePort(): Promise<number> {
  const server = createTcpServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('PORT_UNAVAILABLE');
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

async function stopChild(child: ChildProcess | undefined): Promise<void> {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    once(child, 'exit'),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('CHILD_STOP_TIMEOUT')), 5_000),
    ),
  ]);
}

async function waitReady(port: number): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/readyz`)).status === 200)
        return;
    } catch {
      // Listener has not accepted connections yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('APP_SERVER_READY_TIMEOUT');
}

async function startRemoteAppServer(
  codexHome: string,
  port: number,
  tokenFile: string,
): Promise<ChildProcess> {
  const child = spawn(
    'codex',
    [
      'app-server',
      '--listen',
      `ws://127.0.0.1:${port}`,
      '--ws-auth',
      'capability-token',
      '--ws-token-file',
      tokenFile,
    ],
    {
      env: { ...process.env, CODEX_HOME: codexHome },
      stdio: ['ignore', 'ignore', 'pipe'],
    },
  );
  child.stderr?.resume();
  cleanups.push(() => stopChild(child));
  await waitReady(port);
  return child;
}

async function tlsFixture(
  root: string,
  upstreamPort: number,
): Promise<{
  caCertificatePath: string;
  endpoint: string;
  server: TlsServer;
}> {
  const keyPath = join(root, 'localhost-key.pem');
  const certPath = join(root, 'localhost-cert.pem');
  await execFileAsync('openssl', [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    keyPath,
    '-out',
    certPath,
    '-days',
    '1',
    '-subj',
    '/CN=localhost',
    '-addext',
    'subjectAltName=DNS:localhost',
  ]);
  const clients = new Set<TLSSocket>();
  const server = createTlsServer(
    {
      key: await readFile(keyPath),
      cert: await readFile(certPath),
      minVersion: 'TLSv1.3',
    },
    (client) => {
      clients.add(client);
      const socket = connectTcp(upstreamPort, '127.0.0.1');
      socket.once('error', () => client.destroy());
      client.pipe(socket);
      socket.pipe(client);
      client.once('close', () => {
        clients.delete(client);
        socket.destroy();
      });
      socket.once('close', () => client.destroy());
    },
  );
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('TLS_PORT_UNAVAILABLE');
  cleanups.push(async () => {
    for (const client of clients) client.destroy();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });
  return {
    caCertificatePath: certPath,
    endpoint: `wss://localhost:${address.port}`,
    server,
  };
}

function registry(create: CreateRegistry, token: string): HostRegistry {
  return create({
    connectAppServer: connectAppServer as Connector,
    resolveCredential: async () => token,
    maxReconnectAttempts: 4,
    reconnectBaseDelayMs: 25,
    reconnectMaxDelayMs: 100,
  });
}

describe('[L2:INTEGRATION] App Server host transport', () => {
  it('[L2:INTEGRATION] CAS02-L2-LOCAL-DAEMON-PROXY connects through a managed daemon and recovers after restart', async () => {
    const create = factory();
    const codexHome = await testHome('cas02-local-daemon-');
    const instance = registry(create, 'unused');
    instance.register({
      hostId: 'local-real',
      transport: 'local-proxy',
      expectedVersion: APP_SERVER_PROTOCOL_VERSION,
      codexHome,
      requiredCapabilities: ['thread-events'],
    });

    try {
      const connection = await instance.connect('local-real');
      await expect(
        connection.request('account/read', { refreshToken: false }),
      ).resolves.toMatchObject({ requiresOpenaiAuth: expect.any(Boolean) });
      await expect(instance.health('local-real')).resolves.toMatchObject({
        available: true,
        serverVersion: APP_SERVER_PROTOCOL_VERSION,
      });

      await instance.restart('local-real');
      await connection.reconnect();
      await expect(
        connection.request('account/read', { refreshToken: false }),
      ).resolves.toMatchObject({ requiresOpenaiAuth: expect.any(Boolean) });
      await instance.disable('local-real');
      expect(connection.hostMetrics().closed).toBe(true);
    } finally {
      await instance.disable('local-real').catch(() => undefined);
    }
  });

  it('[L2:INTEGRATION] CAS02-L2-REMOTE-WSS-AUTH-TLS connects to a real authenticated App Server behind TLS', async () => {
    const create = factory();
    const root = await testHome('cas02-remote-wss-');
    const token = 'cas02-high-entropy-capability-token';
    const tokenFile = join(root, 'app-server-token');
    await writeFile(tokenFile, token, { mode: 0o600 });
    const appServerPort = await freePort();
    await startRemoteAppServer(root, appServerPort, tokenFile);
    const tls = await tlsFixture(root, appServerPort);

    const instance = registry(create, token);
    instance.register({
      hostId: 'remote-real',
      transport: 'remote-wss',
      endpoint: tls.endpoint,
      credentialRef: 'remote-real-token',
      caCertificatePath: tls.caCertificatePath,
      expectedVersion: APP_SERVER_PROTOCOL_VERSION,
      requiredCapabilities: ['thread-events'],
    });
    const connection = await instance.connect('remote-real');
    await expect(
      connection.request('account/read', { refreshToken: false }),
    ).resolves.toMatchObject({ requiresOpenaiAuth: expect.any(Boolean) });
    await connection.close();

    const denied = registry(create, 'wrong-capability-token');
    denied.register({
      hostId: 'remote-denied',
      transport: 'remote-wss',
      endpoint: tls.endpoint,
      credentialRef: 'remote-denied-token',
      caCertificatePath: tls.caCertificatePath,
      expectedVersion: APP_SERVER_PROTOCOL_VERSION,
      requiredCapabilities: ['thread-events'],
    });
    let failure: unknown;
    try {
      await denied.connect('remote-denied');
    } catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({ code: 'HOST_AUTHENTICATION_FAILED' });
    expect(String(failure)).not.toContain('wrong-capability-token');
    expect(JSON.stringify(failure)).not.toContain('wrong-capability-token');
  });

  it('[L2:INTEGRATION] CAS02-L2-REMOTE-RECONNECT restores one subscription after real App Server restart', async () => {
    const create = factory();
    const root = await testHome('cas02-remote-reconnect-');
    const token = 'cas02-reconnect-capability-token';
    const tokenFile = join(root, 'app-server-token');
    await writeFile(tokenFile, token, { mode: 0o600 });
    const appServerPort = await freePort();
    let child = await startRemoteAppServer(root, appServerPort, tokenFile);
    const tls = await tlsFixture(root, appServerPort);
    const instance = registry(create, token);
    instance.register({
      hostId: 'remote-restart',
      transport: 'remote-wss',
      endpoint: tls.endpoint,
      credentialRef: 'remote-restart-token',
      caCertificatePath: tls.caCertificatePath,
      expectedVersion: APP_SERVER_PROTOCOL_VERSION,
      requiredCapabilities: ['thread-events'],
    });
    const connection = await instance.connect('remote-restart');
    await connection.subscribe('thread:list', 'thread/list', {
      limit: 10,
    });

    await stopChild(child);
    child = await startRemoteAppServer(root, appServerPort, tokenFile);
    await connection.reconnect();
    expect(connection.hostMetrics()).toMatchObject({
      reconnectAttempts: expect.any(Number),
      subscriptions: 1,
      closed: false,
    });
    await expect(
      connection.request('account/read', { refreshToken: false }),
    ).resolves.toMatchObject({ requiresOpenaiAuth: expect.any(Boolean) });
    await connection.close();
  });
});

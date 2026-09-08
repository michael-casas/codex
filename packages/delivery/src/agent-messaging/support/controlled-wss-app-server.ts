import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  stat,
  writeFile,
} from 'node:fs/promises';
import {
  connect as connectTcp,
  createServer as createTcpServer,
} from 'node:net';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createServer as createTlsServer, type TLSSocket } from 'node:tls';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

interface ControlledAppServerConnection {
  request<T = unknown>(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<T>;
  startThread(params: {
    model: string;
    cwd: string;
    approvalPolicy: 'never';
    sandbox: 'readOnly';
  }): Promise<{ threadId: string; sessionId: string }>;
  messages(options?: { signal?: AbortSignal }): AsyncIterable<{
    kind: string;
    method?: string;
    params: unknown;
  }>;
  reconnect(): Promise<void>;
  close(): Promise<void>;
}

const execFileAsync = promisify(execFile);

async function workspaceFile(path: string): Promise<string> {
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

async function waitReady(port: number): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/readyz`)).status === 200)
        return;
    } catch {
      // The controlled listener is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('APP_SERVER_READY_TIMEOUT');
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  const exited = await Promise.race([
    once(child, 'exit').then(() => true),
    new Promise<false>((resolveWait) =>
      setTimeout(() => resolveWait(false), 5_000),
    ),
  ]);
  if (exited) return;
  child.kill('SIGKILL');
  const killed = await Promise.race([
    once(child, 'exit').then(() => true),
    new Promise<false>((resolveWait) =>
      setTimeout(() => resolveWait(false), 5_000),
    ),
  ]);
  if (!killed) throw new Error('CHILD_STOP_TIMEOUT');
}

async function controlledHome(root: string): Promise<string> {
  const home = join(root, 'codex-home');
  await mkdir(home, { recursive: true });
  const source = process.env.CODEX_HOME ?? join(homedir(), '.codex');
  try {
    await access(join(source, 'auth.json'));
    await symlink(join(source, 'auth.json'), join(home, 'auth.json'));
  } catch {
    // The installed CLI may use platform credential storage.
  }
  try {
    await access(join(source, 'packages', 'standalone'));
    await mkdir(join(home, 'packages'), { recursive: true });
    await symlink(
      join(source, 'packages', 'standalone'),
      join(home, 'packages', 'standalone'),
    );
  } catch {
    // The installed CLI may already be globally available.
  }
  return home;
}

export async function createControlledWssAppServer(
  options: { credential?: string } = {},
): Promise<{
  connection: ControlledAppServerConnection;
  close(): Promise<void>;
}> {
  const codex = await import(
    pathToFileURL(
      await workspaceFile(
        import.meta.url.endsWith('.js')
          ? 'packages/codex/dist/index.js'
          : 'packages/codex/src/index.ts',
      ),
    ).href
  );
  const transport = await import(
    pathToFileURL(
      await workspaceFile(
        import.meta.url.endsWith('.js')
          ? 'packages/transport/dist/index.js'
          : 'packages/transport/src/index.ts',
      ),
    ).href
  );
  const root = await mkdtemp('/tmp/cas05-wss-');
  const token = `cas05-${crypto.randomUUID()}`;
  const tokenFile = join(root, 'token');
  await writeFile(tokenFile, token, { mode: 0o600 });
  const port = await freePort();
  const home = await controlledHome(root);
  const childEnvironment: NodeJS.ProcessEnv = {
    ...process.env,
    CODEX_HOME: home,
  };
  delete childEnvironment.CODEX_THREAD_ID;
  delete childEnvironment.CODEX_SESSION_ID;
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
    { env: childEnvironment, stdio: ['ignore', 'ignore', 'pipe'] },
  );
  child.stderr?.resume();
  const clients = new Set<TLSSocket>();
  let tls: ReturnType<typeof createTlsServer> | undefined;
  async function closeResources(
    connection?: ControlledAppServerConnection,
  ): Promise<void> {
    await connection?.close().catch(() => undefined);
    for (const client of clients) client.destroy();
    try {
      if (tls?.listening)
        await new Promise<void>((resolveClose, reject) =>
          tls?.close((error) => (error ? reject(error) : resolveClose())),
        );
    } finally {
      try {
        await stopChild(child);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  }
  try {
    await waitReady(port);
    const key = join(root, 'key.pem');
    const cert = join(root, 'cert.pem');
    await execFileAsync('openssl', [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      key,
      '-out',
      cert,
      '-days',
      '1',
      '-subj',
      '/CN=localhost',
      '-addext',
      'subjectAltName=DNS:localhost',
    ]);
    tls = createTlsServer(
      {
        key: await readFile(key),
        cert: await readFile(cert),
        minVersion: 'TLSv1.3',
      },
      (client) => {
        clients.add(client);
        const upstream = connectTcp(port, '127.0.0.1');
        client.pipe(upstream);
        upstream.pipe(client);
        client.once('close', () => {
          clients.delete(client);
          upstream.destroy();
        });
        upstream.once('close', () => client.destroy());
      },
    );
    tls.listen(0, '127.0.0.1');
    await once(tls, 'listening');
    const address = tls.address();
    if (!address || typeof address === 'string')
      throw new Error('TLS_PORT_UNAVAILABLE');
    const registry = transport.createAppServerHostRegistry({
      connectAppServer: (options: Record<string, unknown>) =>
        codex.connectAppServer({
          ...options,
          capabilities: { experimentalApi: true },
        }),
      resolveCredential: async () => options.credential ?? token,
      maxReconnectAttempts: 1,
      reconnectBaseDelayMs: 10,
      reconnectMaxDelayMs: 10,
    });
    registry.register({
      hostId: 'cas05-controlled-remote',
      transport: 'remote-wss',
      endpoint: `wss://localhost:${address.port}`,
      credentialRef: 'cas05-fixture-token',
      caCertificatePath: cert,
      expectedVersion: codex.APP_SERVER_PROTOCOL_VERSION,
    });
    const connection = (await registry.connect(
      'cas05-controlled-remote',
    )) as ControlledAppServerConnection;
    return {
      connection,
      async close() {
        await closeResources(connection);
      },
    };
  } catch (error) {
    await closeResources().catch(() => undefined);
    throw error;
  }
}

import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import {
  connect as connectTcp,
  createServer as createTcpServer,
} from 'node:net';
import { join } from 'node:path';
import {
  createServer as createTlsServer,
  type Server as TlsServer,
  type TLSSocket,
} from 'node:tls';
import { promisify } from 'node:util';

import {
  APP_SERVER_PROTOCOL_VERSION,
  connectAppServer,
  type AppServerClient,
} from '@codex/codex';
import { afterEach, describe, expect, it } from 'vitest';

import * as transport from '../../index.js';

const exec = promisify(execFile);
const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length) await cleanups.pop()?.();
});

interface LeaseService {
  acquire(input: {
    hostId: string;
    repositoryId: string;
    baseRevision: string;
    assignmentId: string;
  }): Promise<{ workspaceRef: string }>;
  resolve(
    workspaceRef: string,
  ): Promise<{ cwd: string; tempDirectory?: string }>;
  release(workspaceRef: string): Promise<void>;
}

function factory(): (options: Record<string, unknown>) => LeaseService {
  const candidate = (transport as Record<string, unknown>)
    .createWorkspaceLeaseService;
  expect(
    candidate,
    'CAS-04 workspace lease behavior is not implemented',
  ).toBeTypeOf('function');
  if (typeof candidate !== 'function') throw new Error('LEASE_NOT_IMPLEMENTED');
  return candidate as (options: Record<string, unknown>) => LeaseService;
}

async function repository(prefix: string) {
  const root = await mkdtemp(join('/tmp', prefix));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  const checkoutPath = join(root, 'primary');
  const leaseRoot = join(root, 'leases');
  await mkdir(checkoutPath);
  await mkdir(leaseRoot);
  await exec('git', ['init', '-q', checkoutPath]);
  await exec('git', ['-C', checkoutPath, 'config', 'user.name', 'CAS-04']);
  await exec('git', [
    '-C',
    checkoutPath,
    'config',
    'user.email',
    'cas04@example.test',
  ]);
  await writeFile(join(checkoutPath, 'tracked.txt'), 'base\n');
  await exec('git', ['-C', checkoutPath, 'add', 'tracked.txt']);
  await exec('git', ['-C', checkoutPath, 'commit', '-qm', 'base']);
  const { stdout } = await exec('git', [
    '-C',
    checkoutPath,
    'rev-parse',
    'HEAD',
  ]);
  await writeFile(join(checkoutPath, 'tracked.txt'), 'dirty\n');
  return { root, checkoutPath, leaseRoot, baseRevision: stdout.trim() };
}

async function localClient(): Promise<AppServerClient> {
  const client = await connectAppServer({
    command: process.env['CAS_TEMP_CODEX_BIN'] ?? 'codex',
    expectedVersion: APP_SERVER_PROTOCOL_VERSION,
    clientInfo: { name: 'cas-04-test', title: 'CAS-04 test', version: '1.0.0' },
    serverArgs: ['app-server'],
  });
  cleanups.push(() => client.close());
  return client;
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

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  await once(child, 'exit');
}

async function remoteClient(root: string) {
  const token = 'cas04-controlled-remote-token';
  const tokenFile = join(root, 'app-server-token');
  await writeFile(tokenFile, token, { mode: 0o600 });
  const appServerPort = await freePort();
  const child = spawn(
    'codex',
    [
      'app-server',
      '--listen',
      `ws://127.0.0.1:${appServerPort}`,
      '--ws-auth',
      'capability-token',
      '--ws-token-file',
      tokenFile,
    ],
    {
      env: { ...process.env, CODEX_HOME: root },
      stdio: ['ignore', 'ignore', 'pipe'],
    },
  );
  child.stderr?.resume();
  cleanups.push(() => stopChild(child));
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`http://127.0.0.1:${appServerPort}/readyz`)).ok) break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  const keyPath = join(root, 'localhost-key.pem');
  const certPath = join(root, 'localhost-cert.pem');
  await exec('openssl', [
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
  const tls: TlsServer = createTlsServer(
    {
      key: await readFile(keyPath),
      cert: await readFile(certPath),
      minVersion: 'TLSv1.3',
    },
    (client) => {
      clients.add(client);
      const socket = connectTcp(appServerPort, '127.0.0.1');
      client.pipe(socket).pipe(client);
      client.once('close', () => {
        clients.delete(client);
        socket.destroy();
      });
    },
  );
  tls.listen(0, '127.0.0.1');
  await once(tls, 'listening');
  const address = tls.address();
  if (!address || typeof address === 'string')
    throw new Error('TLS_PORT_UNAVAILABLE');
  cleanups.push(async () => {
    for (const client of clients) client.destroy();
    await new Promise<void>((resolve) => tls.close(() => resolve()));
  });

  const registry = (transport as typeof transport).createAppServerHostRegistry({
    connectAppServer,
    resolveCredential: async () => token,
  });
  registry.register({
    hostId: 'remote-fixture',
    transport: 'remote-wss',
    endpoint: `wss://localhost:${address.port}`,
    credentialRef: 'cas04-fixture-token',
    caCertificatePath: certPath,
    expectedVersion: APP_SERVER_PROTOCOL_VERSION,
  });
  cleanups.push(() => registry.disable('remote-fixture'));
  return registry.connect('remote-fixture');
}

function lease(
  client: AppServerClient,
  checkoutPath: string,
  leaseRoot: string,
) {
  const host = Object.assign(client, {
    hostId: 'fixture-host',
    reconnect: async () => undefined,
  });
  return factory()({
    hosts: { connect: async () => host },
    resolveRepository: async () => ({ checkoutPath, leaseRoot }),
  });
}

describe('[L2:INTEGRATION] Workspace lease real boundary', () => {
  it('[L2:INTEGRATION] TEMP-L2-BUN writes only through the private lease temp and release removes it', async () => {
    const repo = await repository('cas-temp-local-');
    const client = await localClient();
    const service = lease(client, repo.checkoutPath, repo.leaseRoot);
    const acquired = await service.acquire({
      hostId: 'local-fixture',
      repositoryId: 'repo-temp',
      baseRevision: repo.baseRevision,
      assignmentId: 'CAS-TEMP-R1',
    });
    const resolved = await service.resolve(acquired.workspaceRef);
    expect(resolved.tempDirectory).toMatch(
      new RegExp(
        `^${await realpath(repo.leaseRoot)}/[a-f0-9]{64}/\\.codex-workspace-tmp$`,
      ),
    );
    if (!resolved.tempDirectory) throw Error('TEMP_DIRECTORY_MISSING');
    const metadata = await stat(resolved.tempDirectory);
    expect(metadata.isDirectory()).toBe(true);
    expect(metadata.isSymbolicLink()).toBe(false);
    expect(metadata.mode & 0o777).toBe(0o700);
    const result = await client.request<{ exitCode: number; stdout: string }>(
      'command/exec',
      {
        command: [
          'env',
          `TMPDIR=${resolved.tempDirectory}`,
          'bun',
          '-e',
          'await Bun.write(process.env.TMPDIR+"/bun-probe","ok");console.log("TEMP_WRITE_OK")',
        ],
        cwd: resolved.cwd,
        timeoutMs: 10_000,
        sandboxPolicy: {
          type: 'workspaceWrite',
          writableRoots: [resolved.cwd, resolved.tempDirectory],
          networkAccess: false,
          excludeTmpdirEnvVar: true,
          excludeSlashTmp: true,
        },
      },
    );
    expect(result).toMatchObject({
      exitCode: 0,
      stdout: expect.stringContaining('TEMP_WRITE_OK'),
    });
    expect(
      await readFile(join(resolved.tempDirectory, 'bun-probe'), 'utf8'),
    ).toBe('ok');
    await service.release(acquired.workspaceRef);
    await expect(access(resolved.tempDirectory)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('[L2:INTEGRATION] CAS04-L2-LOCAL-EXACT-CLEAN preserves a dirty primary checkout and removes only its exact-revision worktree', async () => {
    const repo = await repository('cas04-local-');
    const service = lease(
      await localClient(),
      repo.checkoutPath,
      repo.leaseRoot,
    );
    const result = await service.acquire({
      hostId: 'local-fixture',
      repositoryId: 'repo-1',
      baseRevision: repo.baseRevision,
      assignmentId: 'CAS-04-local',
    });

    const entries = await exec('git', [
      '-C',
      repo.checkoutPath,
      'worktree',
      'list',
      '--porcelain',
    ]);
    expect(entries.stdout).toContain(repo.baseRevision);
    expect(await readFile(join(repo.checkoutPath, 'tracked.txt'), 'utf8')).toBe(
      'dirty\n',
    );

    await service.release(result.workspaceRef);
    const after = await exec('git', [
      '-C',
      repo.checkoutPath,
      'worktree',
      'list',
      '--porcelain',
    ]);
    expect(after.stdout).not.toContain(repo.leaseRoot);
    expect(await readFile(join(repo.checkoutPath, 'tracked.txt'), 'utf8')).toBe(
      'dirty\n',
    );
  });

  it('[L2:INTEGRATION] CAS04-L2-REMOTE-RECONCILE uses the same App Server-only seam after an ambiguous command result', async () => {
    const repo = await repository('cas04-remote-');
    const client = await remoteClient(repo.root);
    let ambiguous = true;
    const host = {
      hostId: 'remote-fixture',
      reconnect: () => client.reconnect(),
      request: async (method: string, params?: unknown) => {
        const result = await client.request(method, params as never);
        if (
          ambiguous &&
          method === 'command/exec' &&
          Array.isArray((params as { command?: unknown }).command) &&
          (params as { command: string[] }).command.includes('add')
        ) {
          ambiguous = false;
          throw Object.assign(new Error('disconnect'), {
            code: 'HOST_CONNECTION_LOST',
            ambiguous: true,
          });
        }
        return result;
      },
    };
    const service = factory()({
      hosts: { connect: async () => host },
      resolveRepository: async () => ({
        checkoutPath: repo.checkoutPath,
        leaseRoot: repo.leaseRoot,
      }),
    });
    const result = await service.acquire({
      hostId: 'remote-fixture',
      repositoryId: 'repo-1',
      baseRevision: repo.baseRevision,
      assignmentId: 'CAS-04-remote',
    });
    expect(result.workspaceRef).toMatch(/^workspace:/);
    await service.release(result.workspaceRef);
  });

  it('[L2:INTEGRATION] CAS04-L2-PATH-REVISION-DENIAL rejects a symlink lease root and wrong exact revision without touching foreign data', async () => {
    const repo = await repository('cas04-denial-');
    const foreign = join(repo.root, 'foreign');
    const linked = join(repo.root, 'linked-leases');
    await mkdir(foreign);
    await writeFile(join(foreign, 'keep.txt'), 'keep\n');
    await symlink(foreign, linked);
    const client = await localClient();
    const symlinkService = lease(client, repo.checkoutPath, linked);
    await expect(
      symlinkService.acquire({
        hostId: 'local-fixture',
        repositoryId: 'repo-1',
        baseRevision: repo.baseRevision,
        assignmentId: 'CAS-04-symlink',
      }),
    ).rejects.toMatchObject({ code: 'UNSAFE_WORKSPACE' });

    const wrongService = lease(client, repo.checkoutPath, repo.leaseRoot);
    await expect(
      wrongService.acquire({
        hostId: 'local-fixture',
        repositoryId: 'repo-1',
        baseRevision: 'f'.repeat(40),
        assignmentId: 'CAS-04-wrong-revision',
      }),
    ).rejects.toMatchObject({ code: 'REVISION_MISMATCH' });
    expect(await readFile(join(foreign, 'keep.txt'), 'utf8')).toBe('keep\n');
  });
});

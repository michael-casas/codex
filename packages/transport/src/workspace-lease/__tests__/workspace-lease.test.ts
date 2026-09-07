import { Buffer } from 'node:buffer';

import { describe, expect, it, vi } from 'vitest';

import * as transport from '../../index.js';

const BASE = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
const CHECKOUT = '/srv/repos/project';
const LEASE_ROOT = '/srv/leases';

type Acquire = {
  hostId: string;
  repositoryId: string;
  baseRevision: string;
  assignmentId: string;
};

interface LeaseService {
  acquire(input: Acquire): Promise<{ workspaceRef: string }>;
  resolve(
    workspaceRef: string,
  ): Promise<{ cwd: string; tempDirectory?: string }>;
  release(workspaceRef: string): Promise<void>;
}

interface FakeHost {
  requests: Array<{ method: string; params: Record<string, unknown> }>;
  marker?: string;
  request(method: string, params?: unknown): Promise<unknown>;
  reconnect(): Promise<void>;
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

function fakeHost(): FakeHost {
  const requests: FakeHost['requests'] = [];
  const host: FakeHost = {
    requests,
    reconnect: vi.fn(async () => undefined),
    async request(method, value) {
      const params = (value ?? {}) as Record<string, unknown>;
      requests.push({ method, params });
      if (method === 'fs/getMetadata') {
        return {
          isDirectory: true,
          isFile: false,
          isSymlink: false,
          createdAtMs: 0,
          modifiedAtMs: 0,
        };
      }
      if (method === 'fs/writeFile') {
        host.marker = Buffer.from(
          String(params.dataBase64),
          'base64',
        ).toString();
        return {};
      }
      if (method === 'fs/readFile') {
        return {
          dataBase64: Buffer.from(host.marker ?? '').toString('base64'),
        };
      }
      if (method === 'command/exec') {
        const command = params.command as string[];
        if (command[0] === 'find')
          return { exitCode: 0, stdout: '', stderr: '' };
        if (command.includes('worktree') && command.includes('add')) {
          return { exitCode: 0, stdout: 'Preparing worktree', stderr: '' };
        }
        if (command.includes('worktree') && command.includes('remove')) {
          return { exitCode: 0, stdout: '', stderr: '' };
        }
        if (command.includes('--show-toplevel')) {
          return {
            exitCode: 0,
            stdout: `${CHECKOUT}\n${BASE}\n${BASE}\n`,
            stderr: '',
          };
        }
        return { exitCode: 0, stdout: `${BASE}\n`, stderr: '' };
      }
      throw new Error(`UNEXPECTED_METHOD:${method}`);
    },
  };
  return host;
}

function service(
  host = fakeHost(),
  resolveRepository?: () => Promise<unknown>,
) {
  return {
    host,
    lease: factory()({
      hosts: { connect: vi.fn(async () => host) },
      resolveRepository:
        resolveRepository ??
        vi.fn(async () => ({ checkoutPath: CHECKOUT, leaseRoot: LEASE_ROOT })),
    }),
  };
}

const input = (baseRevision = BASE): Acquire => ({
  hostId: 'host-1',
  repositoryId: 'repo-1',
  baseRevision,
  assignmentId: 'CAS-04',
});

describe('[L1:UNIT] Workspace lease validation and conflict', () => {
  it('[L1:UNIT] CAS04-L1-VALIDATION-CONFLICT rejects caller paths, ambiguous revisions, and incompatible concurrent reuse before provider writes', async () => {
    const { lease, host } = service();
    await expect(
      lease.acquire({ ...input(), workspacePath: '/tmp/escape' } as Acquire),
    ).rejects.toMatchObject({ code: 'INVALID_LEASE' });
    await expect(lease.acquire(input('main'))).rejects.toMatchObject({
      code: 'INVALID_LEASE',
    });
    expect(host.requests).toHaveLength(0);

    let resolve!: (value: unknown) => void;
    const pending = new Promise((done) => (resolve = done));
    const delayed = service(host, () => pending);
    const first = delayed.lease.acquire(input());
    await expect(delayed.lease.acquire(input(OTHER))).rejects.toMatchObject({
      code: 'LEASE_CONFLICT',
    });
    expect(host.requests).toHaveLength(0);
    resolve({ checkoutPath: CHECKOUT, leaseRoot: LEASE_ROOT });
    await first;
  });
});

describe('[L1:INTEGRATION] Workspace lease lifecycle', () => {
  it('[L1:INTEGRATION] TEMP-L1-LEASE owns isolated private temp directories and rejects a symlinked reservation', async () => {
    const { lease, host } = service();
    const first = await lease.acquire(input());
    const second = await lease.acquire({
      ...input(),
      assignmentId: 'CAS-TEMP-R1-other',
    });
    const resolved = await Promise.all([
      lease.resolve(first.workspaceRef),
      lease.resolve(second.workspaceRef),
    ]);
    expect(resolved.map((value) => value.tempDirectory)).toEqual([
      expect.stringMatching(
        /^\/srv\/leases\/[a-f0-9]{64}\/\.codex-workspace-tmp$/,
      ),
      expect.stringMatching(
        /^\/srv\/leases\/[a-f0-9]{64}\/\.codex-workspace-tmp$/,
      ),
    ]);
    expect(new Set(resolved.map((value) => value.tempDirectory)).size).toBe(2);
    expect(
      host.requests
        .filter(
          ({ method, params }) =>
            method === 'command/exec' &&
            (params.command as string[])[0] === 'mkdir',
        )
        .map(({ params }) => params.command),
    ).toEqual([
      ['mkdir', '-m', '700', '--', resolved[0].tempDirectory],
      ['mkdir', '-m', '700', '--', resolved[1].tempDirectory],
    ]);
    host.marker = JSON.stringify({
      workspaceRef: first.workspaceRef,
      ...input(),
    });
    await lease.release(first.workspaceRef);
    host.marker = JSON.stringify({
      workspaceRef: second.workspaceRef,
      ...input(),
      assignmentId: 'CAS-TEMP-R1-other',
    });
    await lease.release(second.workspaceRef);

    const hostile = fakeHost();
    const request = hostile.request.bind(hostile);
    hostile.request = async (method, params) => {
      if (
        method === 'fs/getMetadata' &&
        String((params as { path?: string })?.path).endsWith(
          '/.codex-workspace-tmp',
        )
      )
        return {
          isDirectory: true,
          isFile: false,
          isSymlink: true,
          createdAtMs: 0,
          modifiedAtMs: 0,
        };
      return request(method, params);
    };
    const unsafe = service(hostile).lease;
    await expect(unsafe.acquire(input())).rejects.toMatchObject({
      code: 'UNSAFE_WORKSPACE',
    });
    expect(
      hostile.requests.some(
        ({ method, params }) =>
          method === 'command/exec' &&
          (params.command as string[]).includes('remove'),
      ),
    ).toBe(true);
  });

  it('[L1:INTEGRATION] CAS09R2-L1-RESOLVE returns the owned workspace path only while the lease is active', async () => {
    const { lease } = service();
    const { workspaceRef } = await lease.acquire(input());

    await expect(lease.resolve(workspaceRef)).resolves.toEqual({
      cwd: expect.stringMatching(new RegExp(`^${LEASE_ROOT}/[a-f0-9]{64}$`)),
      tempDirectory: expect.stringMatching(
        new RegExp(`^${LEASE_ROOT}/[a-f0-9]{64}/\\.codex-workspace-tmp$`),
      ),
    });
    await lease.release(workspaceRef);
    await expect(lease.resolve(workspaceRef)).rejects.toMatchObject({
      code: 'LEASE_NOT_FOUND',
    });
  });

  it('[L1:INTEGRATION] CAS04-L1-ACQUIRE-REPLAY returns one opaque ref and replays without more provider writes', async () => {
    const { lease, host } = service();
    const first = await lease.acquire(input());
    const requestCount = host.requests.length;
    const replay = await lease.acquire(input());

    expect(replay).toEqual(first);
    expect(replay).toEqual({
      workspaceRef: expect.stringMatching(/^workspace:[a-f0-9]{64}$/),
    });
    expect(JSON.stringify(replay)).not.toContain(CHECKOUT);
    expect(host.requests).toHaveLength(requestCount);
  });

  it('[L1:INTEGRATION] CAS04-L1-OWNED-RELEASE is idempotent and refuses a foreign marker without deleting it', async () => {
    const { lease, host } = service();
    const { workspaceRef } = await lease.acquire(input());
    host.marker = JSON.stringify({ workspaceRef: 'workspace:foreign' });

    await expect(lease.release(workspaceRef)).rejects.toMatchObject({
      code: 'LEASE_OWNERSHIP_MISMATCH',
    });
    expect(
      host.requests.some(
        ({ method, params }) =>
          method === 'command/exec' &&
          (params.command as string[]).includes('remove'),
      ),
    ).toBe(false);

    host.marker = JSON.stringify({
      workspaceRef,
      hostId: 'host-1',
      repositoryId: 'repo-1',
      baseRevision: BASE,
      assignmentId: 'CAS-04',
    });
    await lease.release(workspaceRef);
    const count = host.requests.length;
    await lease.release(workspaceRef);
    expect(host.requests).toHaveLength(count);
  });
});

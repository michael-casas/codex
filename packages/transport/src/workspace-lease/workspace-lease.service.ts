import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { isAbsolute, join, relative, resolve } from 'node:path';

import type { AppServerJson } from '@codex/codex';

import type {
  AppServerHostConnection,
  AppServerHostRegistry,
} from '../app-server-host/app-server-host.registry.js';

export type WorkspaceRef = `workspace:${string}`;

export interface WorkspaceLeaseAcquire {
  readonly hostId: string;
  readonly repositoryId: string;
  readonly baseRevision: string;
  readonly assignmentId: string;
}

export interface WorkspaceLeaseResult {
  readonly workspaceRef: WorkspaceRef;
}

export interface WorkspaceRepositoryLocation {
  readonly checkoutPath: string;
  readonly leaseRoot: string;
}

export interface WorkspaceLeaseServiceOptions {
  readonly hosts: Pick<AppServerHostRegistry, 'connect'>;
  readonly resolveRepository: (identity: {
    hostId: string;
    repositoryId: string;
  }) => Promise<WorkspaceRepositoryLocation>;
}

export type WorkspaceLeaseErrorCode =
  | 'INVALID_LEASE'
  | 'LEASE_CONFLICT'
  | 'LEASE_NOT_FOUND'
  | 'LEASE_OWNERSHIP_MISMATCH'
  | 'PROVIDER_FAILURE'
  | 'REVISION_MISMATCH'
  | 'WORKSPACE_ASSOCIATION_MISMATCH'
  | 'UNSAFE_WORKSPACE';

export class WorkspaceLeaseError extends Error {
  override readonly name = 'WorkspaceLeaseError';

  constructor(
    readonly code: WorkspaceLeaseErrorCode,
    message: string,
    readonly ambiguous = false,
  ) {
    super(message);
  }
}

async function providerRequest(
  host: AppServerHostConnection,
  method: string,
  params: AppServerJson,
): Promise<unknown> {
  try {
    return await host.request(method, params);
  } catch (error) {
    if (error instanceof WorkspaceLeaseError) throw error;
    throw new WorkspaceLeaseError(
      'PROVIDER_FAILURE',
      'App Server workspace request failed',
      isAmbiguous(error),
    );
  }
}

export interface WorkspaceLeaseService {
  acquire(input: WorkspaceLeaseAcquire): Promise<WorkspaceLeaseResult>;
  authorizeExisting(input: WorkspaceLeaseAcquire, cwd: string): Promise<{ readonly cwd: string }>;
  resolve(
    workspaceRef: WorkspaceRef,
  ): Promise<{ readonly cwd: string; readonly tempDirectory: string }>;
  release(workspaceRef: WorkspaceRef): Promise<void>;
}

interface LeaseRecord extends WorkspaceLeaseAcquire, WorkspaceLeaseResult {
  assignmentKey: string;
  checkoutPath: string;
  leaseRoot: string;
  metadataPath: string;
  workspacePath: string;
  tempDirectory: string;
  host: AppServerHostConnection;
}

interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const REVISION = /^[a-f0-9]{40}$/;
const INPUT_KEYS = new Set([
  'hostId',
  'repositoryId',
  'baseRevision',
  'assignmentId',
]);

const fail = (code: WorkspaceLeaseErrorCode, message: string) =>
  new WorkspaceLeaseError(code, message);

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function validateInput(value: WorkspaceLeaseAcquire): WorkspaceLeaseAcquire {
  const input = record(value);
  if (
    !input ||
    Object.keys(input).some((key) => !INPUT_KEYS.has(key)) ||
    !IDENTITY.test(String(input.hostId ?? '')) ||
    !IDENTITY.test(String(input.repositoryId ?? '')) ||
    !IDENTITY.test(String(input.assignmentId ?? '')) ||
    !REVISION.test(String(input.baseRevision ?? ''))
  ) {
    throw fail('INVALID_LEASE', 'Invalid workspace lease identity');
  }
  return value;
}

function safePath(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !isAbsolute(value) ||
    resolve(value) !== value
  ) {
    throw fail('UNSAFE_WORKSPACE', 'Unsafe workspace location');
  }
  return value;
}

function digest(input: WorkspaceLeaseAcquire): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        input.hostId,
        input.repositoryId,
        input.baseRevision,
        input.assignmentId,
      ]),
    )
    .digest('hex');
}

function commandResult(value: unknown): CommandResult {
  const result = record(value);
  if (
    !result ||
    typeof result.exitCode !== 'number' ||
    typeof result.stdout !== 'string' ||
    typeof result.stderr !== 'string'
  ) {
    throw fail('PROVIDER_FAILURE', 'Invalid App Server command response');
  }
  return result as unknown as CommandResult;
}

async function command(
  host: AppServerHostConnection,
  argv: string[],
  cwd: string,
  writableRoots?: string[],
): Promise<CommandResult> {
  const sandboxPolicy: AppServerJson = writableRoots
    ? {
        type: 'workspaceWrite',
        writableRoots,
        networkAccess: false,
        excludeTmpdirEnvVar: true,
        excludeSlashTmp: true,
      }
    : { type: 'readOnly', networkAccess: false };
  return commandResult(
    await providerRequest(host, 'command/exec', {
      command: argv,
      cwd,
      timeoutMs: 30_000,
      sandboxPolicy,
    }),
  );
}

async function metadata(host: AppServerHostConnection, path: string) {
  const value = record(await providerRequest(host, 'fs/getMetadata', { path }));
  if (
    !value ||
    typeof value.isDirectory !== 'boolean' ||
    typeof value.isSymlink !== 'boolean'
  ) {
    throw fail('PROVIDER_FAILURE', 'Invalid App Server metadata response');
  }
  return value;
}

function marker(recordValue: LeaseRecord): string {
  return JSON.stringify({
    workspaceRef: recordValue.workspaceRef,
    hostId: recordValue.hostId,
    repositoryId: recordValue.repositoryId,
    baseRevision: recordValue.baseRevision,
    assignmentId: recordValue.assignmentId,
  });
}

function isAmbiguous(error: unknown): boolean {
  return record(error)?.ambiguous === true;
}

async function pathExists(
  host: AppServerHostConnection,
  leaseRoot: string,
  name: string,
): Promise<boolean> {
  const result = await command(
    host,
    ['find', leaseRoot, '-maxdepth', '1', '-name', name, '-print'],
    leaseRoot,
  );
  if (result.exitCode !== 0)
    throw fail('PROVIDER_FAILURE', 'Could not inspect workspace root');
  return result.stdout.trim().length > 0;
}

async function verifyWorkspace(recordValue: LeaseRecord): Promise<boolean> {
  try {
    const result = await command(
      recordValue.host,
      ['git', '-C', recordValue.workspacePath, 'rev-parse', 'HEAD'],
      recordValue.leaseRoot,
    );
    return (
      result.exitCode === 0 && result.stdout.trim() === recordValue.baseRevision
    );
  } catch {
    return false;
  }
}

async function removeWorkspace(recordValue: LeaseRecord): Promise<void> {
  const result = await command(
    recordValue.host,
    [
      'git',
      '--git-dir',
      recordValue.metadataPath,
      'worktree',
      'remove',
      '--force',
      recordValue.workspacePath,
    ],
    recordValue.leaseRoot,
    [recordValue.leaseRoot],
  );
  if (result.exitCode !== 0)
    throw fail('PROVIDER_FAILURE', 'Could not release workspace lease');
}

async function removeLeaseFiles(recordValue: LeaseRecord): Promise<void> {
  const result = await command(
    recordValue.host,
    ['rm', '-rf', '--', recordValue.workspacePath, recordValue.metadataPath],
    recordValue.leaseRoot,
    [recordValue.leaseRoot],
  );
  if (result.exitCode !== 0)
    throw fail('PROVIDER_FAILURE', 'Could not clean workspace lease');
}

export function createWorkspaceLeaseService(
  options: WorkspaceLeaseServiceOptions,
): WorkspaceLeaseService {
  if (
    !options ||
    typeof options.hosts?.connect !== 'function' ||
    typeof options.resolveRepository !== 'function'
  ) {
    throw fail('INVALID_LEASE', 'Invalid workspace lease options');
  }

  const activeByAssignment = new Map<string, LeaseRecord>();
  const activeByRef = new Map<WorkspaceRef, LeaseRecord>();
  const released = new Set<WorkspaceRef>();
  const pending = new Map<
    string,
    { fingerprint: string; promise: Promise<WorkspaceLeaseResult> }
  >();

  async function prepare(input: WorkspaceLeaseAcquire): Promise<LeaseRecord> {
    const location = await options.resolveRepository({
      hostId: input.hostId,
      repositoryId: input.repositoryId,
    });
    let checkoutPath = safePath(location?.checkoutPath);
    let leaseRoot = safePath(location?.leaseRoot);
    const host = await options.hosts.connect(input.hostId);
    const [checkoutMetadata, leaseMetadata] = await Promise.all([
      metadata(host, checkoutPath),
      metadata(host, leaseRoot),
    ]);
    if (
      !checkoutMetadata.isDirectory ||
      checkoutMetadata.isSymlink ||
      !leaseMetadata.isDirectory ||
      leaseMetadata.isSymlink
    ) {
      throw fail('UNSAFE_WORKSPACE', 'Unsafe workspace location');
    }

    const inspect = await command(
      host,
      [
        'git',
        '-C',
        checkoutPath,
        'rev-parse',
        '--show-toplevel',
        'HEAD',
        `${input.baseRevision}^{commit}`,
      ],
      checkoutPath,
    );
    const [topLevel, , resolvedRevision] = inspect.stdout.trim().split('\n');
    if (inspect.exitCode !== 0 || resolvedRevision !== input.baseRevision) {
      throw fail('REVISION_MISMATCH', 'Repository revision mismatch');
    }
    if (topLevel !== checkoutPath) {
      const canonical = await command(
        host,
        ['realpath', checkoutPath, leaseRoot],
        checkoutPath,
      );
      const [canonicalCheckout, canonicalLeaseRoot] = canonical.stdout
        .trim()
        .split('\n');
      if (
        canonical.exitCode !== 0 ||
        canonicalCheckout !== topLevel ||
        !canonicalLeaseRoot
      ) {
        throw fail('UNSAFE_WORKSPACE', 'Ambiguous repository identity');
      }
      checkoutPath = canonicalCheckout;
      leaseRoot = canonicalLeaseRoot;
    }

    const hash = digest(input);
    const workspaceRef = `workspace:${hash}` as WorkspaceRef;
    const workspacePath = join(leaseRoot, hash);
    const metadataPath = join(leaseRoot, `${hash}.git`);
    const tempDirectory = join(workspacePath, '.codex-workspace-tmp');
    if (
      relative(leaseRoot, workspacePath).startsWith('..') ||
      (await pathExists(host, leaseRoot, hash)) ||
      (await pathExists(host, leaseRoot, `${hash}.git`))
    ) {
      throw fail('UNSAFE_WORKSPACE', 'Workspace path is not empty');
    }

    const lease: LeaseRecord = {
      ...input,
      assignmentKey: `${input.hostId}\0${input.repositoryId}\0${input.assignmentId}`,
      checkoutPath,
      leaseRoot,
      metadataPath,
      workspacePath,
      tempDirectory,
      workspaceRef,
      host,
    };
    let created = false;
    try {
      const cloned = await command(
        host,
        [
          'git',
          'clone',
          '--bare',
          '--no-hardlinks',
          checkoutPath,
          metadataPath,
        ],
        leaseRoot,
        [leaseRoot],
      );
      if (cloned.exitCode !== 0)
        throw fail('PROVIDER_FAILURE', 'Could not prepare workspace lease');
      try {
        const added = await command(
          host,
          [
            'git',
            '--git-dir',
            metadataPath,
            'worktree',
            'add',
            '--detach',
            workspacePath,
            input.baseRevision,
          ],
          leaseRoot,
          [leaseRoot],
        );
        if (added.exitCode !== 0)
          throw fail('PROVIDER_FAILURE', 'Could not create workspace lease');
        created = true;
      } catch (error) {
        if (!isAmbiguous(error)) throw error;
        await host.reconnect();
        created = await verifyWorkspace(lease);
        if (!created)
          throw fail('PROVIDER_FAILURE', 'Ambiguous workspace acquisition');
      }

      if (!(await verifyWorkspace(lease)))
        throw fail('REVISION_MISMATCH', 'Workspace revision mismatch');
      if (await pathExists(host, workspacePath, '.codex-workspace-tmp'))
        throw fail('UNSAFE_WORKSPACE', 'Workspace temp reservation is unsafe');
      const createdTemp = await command(
        host,
        ['mkdir', '-m', '700', '--', tempDirectory],
        workspacePath,
        [workspacePath],
      );
      if (createdTemp.exitCode !== 0)
        throw fail(
          'PROVIDER_FAILURE',
          'Could not create workspace temp directory',
        );
      const tempMetadata = await metadata(host, tempDirectory);
      if (!tempMetadata.isDirectory || tempMetadata.isSymlink)
        throw fail('UNSAFE_WORKSPACE', 'Workspace temp reservation is unsafe');
      await providerRequest(host, 'fs/writeFile', {
        path: join(workspacePath, '.codex-workspace-lease.json'),
        dataBase64: Buffer.from(marker(lease)).toString('base64'),
      });
      return lease;
    } catch (error) {
      if (created) await removeWorkspace(lease).catch(() => undefined);
      await removeLeaseFiles(lease).catch(() => undefined);
      throw error;
    }
  }

  return {
    async authorizeExisting(rawInput, rawCwd) {
      const input = validateInput(rawInput);
      const cwd = safePath(rawCwd);
      const location = await options.resolveRepository({ hostId: input.hostId, repositoryId: input.repositoryId });
      const checkoutPath = safePath(location.checkoutPath);
      const host = await options.hosts.connect(input.hostId);
      const [cwdMetadata, checkoutMetadata] = await Promise.all([metadata(host, cwd), metadata(host, checkoutPath)]);
      if (!cwdMetadata.isDirectory || cwdMetadata.isSymlink || !checkoutMetadata.isDirectory || checkoutMetadata.isSymlink) throw fail('WORKSPACE_ASSOCIATION_MISMATCH', 'Existing workspace is not an admitted repository checkout');
      const inspect = async (path: string) => command(host, ['git', '-C', path, 'rev-parse', '--show-toplevel', '--path-format=absolute', '--git-common-dir', `${input.baseRevision}^{commit}`], path);
      const [candidate, configured] = await Promise.all([inspect(cwd), inspect(checkoutPath)]);
      const candidateLines = candidate.stdout.trim().split('\n');
      const configuredLines = configured.stdout.trim().split('\n');
      if (candidate.exitCode !== 0 || configured.exitCode !== 0 || candidateLines.length !== 3 || configuredLines.length !== 3 || candidateLines[1] !== configuredLines[1] || candidateLines[2] !== input.baseRevision) throw fail('WORKSPACE_ASSOCIATION_MISMATCH', 'Existing workspace does not belong to the configured repository and revision');
      return { cwd };
    },

    async acquire(rawInput) {
      const input = validateInput(rawInput);
      const assignmentKey = `${input.hostId}\0${input.repositoryId}\0${input.assignmentId}`;
      const fingerprint = digest(input);
      const active = activeByAssignment.get(assignmentKey);
      if (active) {
        if (active.workspaceRef.slice('workspace:'.length) !== fingerprint)
          throw fail('LEASE_CONFLICT', 'Conflicting workspace lease reuse');
        return { workspaceRef: active.workspaceRef };
      }
      const inFlight = pending.get(assignmentKey);
      if (inFlight) {
        if (inFlight.fingerprint !== fingerprint)
          throw fail('LEASE_CONFLICT', 'Conflicting workspace lease reuse');
        return inFlight.promise;
      }

      const promise = prepare(input)
        .then((lease) => {
          activeByAssignment.set(assignmentKey, lease);
          activeByRef.set(lease.workspaceRef, lease);
          released.delete(lease.workspaceRef);
          return { workspaceRef: lease.workspaceRef };
        })
        .finally(() => pending.delete(assignmentKey));
      pending.set(assignmentKey, { fingerprint, promise });
      return promise;
    },

    async resolve(workspaceRef) {
      const lease = activeByRef.get(workspaceRef);
      if (!lease || released.has(workspaceRef))
        throw fail('LEASE_NOT_FOUND', 'Workspace lease not found');
      if (!(await verifyWorkspace(lease)))
        throw fail('REVISION_MISMATCH', 'Workspace revision mismatch');
      const tempMetadata = await metadata(lease.host, lease.tempDirectory);
      if (!tempMetadata.isDirectory || tempMetadata.isSymlink)
        throw fail('UNSAFE_WORKSPACE', 'Workspace temp reservation is unsafe');
      return { cwd: lease.workspacePath, tempDirectory: lease.tempDirectory };
    },

    async release(workspaceRef) {
      if (released.has(workspaceRef)) return;
      const lease = activeByRef.get(workspaceRef);
      if (!lease) throw fail('LEASE_NOT_FOUND', 'Workspace lease not found');
      const response = record(
        await providerRequest(lease.host, 'fs/readFile', {
          path: join(lease.workspacePath, '.codex-workspace-lease.json'),
        }),
      );
      if (typeof response?.dataBase64 !== 'string')
        throw fail(
          'LEASE_OWNERSHIP_MISMATCH',
          'Workspace lease marker missing',
        );
      let contents: string;
      try {
        contents = Buffer.from(response.dataBase64, 'base64').toString();
      } catch {
        throw fail(
          'LEASE_OWNERSHIP_MISMATCH',
          'Workspace lease marker invalid',
        );
      }
      if (contents !== marker(lease))
        throw fail(
          'LEASE_OWNERSHIP_MISMATCH',
          'Workspace lease marker mismatch',
        );

      try {
        await removeWorkspace(lease);
      } catch (error) {
        if (!isAmbiguous(error)) throw error;
        await lease.host.reconnect();
        if (
          await pathExists(
            lease.host,
            lease.leaseRoot,
            lease.workspacePath.slice(lease.leaseRoot.length + 1),
          )
        ) {
          throw fail('PROVIDER_FAILURE', 'Ambiguous workspace release');
        }
      }
      await removeLeaseFiles(lease);
      activeByRef.delete(workspaceRef);
      activeByAssignment.delete(lease.assignmentKey);
      released.add(workspaceRef);
    },
  };
}

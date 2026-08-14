import { randomUUID } from 'node:crypto';
import { link, mkdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';

import { sha256, type WorkflowArtifact } from '@codex/workflows';

const MAX_EVENTS = 10_000;
const MAX_NODES = 4_096;
const MAX_ARTIFACT_BYTES = 8_388_608;
const SENSITIVE_KEYS = new Set([
  'prompt',
  'input',
  'env',
  'environment',
  'secret',
  'secrets',
  'error',
  'rawerror',
  'stack',
  'token',
  'apikey',
  'apitoken',
  'accesstoken',
  'refreshtoken',
  'bearertoken',
  'password',
  'passwd',
  'authorization',
  'credentials',
  'credential',
  'cookie',
  'setcookie',
  'sessionid',
  'privatekey',
  'accesskey',
]);

export class LocalJournalError extends Error {
  constructor(
    readonly code:
      | 'JOURNAL_LIMIT_EXCEEDED'
      | 'ARTIFACT_NAME_INVALID'
      | 'ARTIFACT_ALREADY_EXISTS'
      | 'ARTIFACT_PUBLIC_PATH_INVALID'
      | 'ARTIFACT_WRITE_FAILED'
      | 'ARTIFACT_TOO_LARGE'
      | 'JOURNAL_FINALIZED'
      | 'RUN_ID_INVALID',
    message: string,
  ) {
    super(message);
    this.name = 'LocalJournalError';
  }
}

interface JournalState {
  schemaVersion: 1;
  authority: 'local-operational-journal';
  runId: string;
  workflowId: string;
  sourcePath: string;
  sourceDigest: `sha256:${string}`;
  inputDigest: `sha256:${string}`;
  startedAt: string;
  completedAt?: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  nodes: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
  artifacts: WorkflowArtifact[];
}

export interface CreateLocalRunJournalOptions {
  root: string;
  runId: string;
  workflowId: string;
  sourcePath: string;
  sourceDigest: `sha256:${string}`;
  inputDigest: `sha256:${string}`;
  startedAt: string;
  workingDirectory?: string;
}

export interface LocalRunJournal {
  readonly journalPath: string;
  readonly runDirectory: string;
  readonly artifactsDirectory: string;
  record(event: Record<string, unknown>): Promise<void>;
  writeArtifact(request: {
    name: string;
    value: unknown;
    mediaType?: string;
    publishPath?: string;
  }): Promise<WorkflowArtifact>;
  finalize(outcome: {
    status: 'completed' | 'failed' | 'cancelled';
    completedAt: string;
  }): Promise<void>;
}

function normalizedKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function sanitize(value: unknown, key?: string): unknown {
  if (key && SENSITIVE_KEYS.has(normalizedKey(key))) return '[redacted]';
  if (Array.isArray(value)) return value.map((child) => sanitize(child));
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([childKey, child]) => [
      childKey,
      sanitize(child, childKey),
    ]),
  );
}

function artifactBytes(value: unknown): Uint8Array {
  if (typeof value === 'string') return new TextEncoder().encode(value);
  const encoded = JSON.stringify(value, null, 2);
  if (encoded === undefined) {
    throw new LocalJournalError(
      'ARTIFACT_TOO_LARGE',
      'Artifact value must be JSON serializable or a string.',
    );
  }
  return new TextEncoder().encode(`${encoded}\n`);
}

function inferredMediaType(name: string): string {
  if (name.endsWith('.md')) return 'text/markdown';
  if (name.endsWith('.txt')) return 'text/plain';
  if (name.endsWith('.json')) return 'application/json';
  return 'application/octet-stream';
}

function validArtifactName(name: string): boolean {
  return (
    name.length > 0 &&
    name.length <= 128 &&
    name === basename(name) &&
    !name.includes('/') &&
    !name.includes('\\') &&
    !name.startsWith('.') &&
    !name.includes('\0')
  );
}

function isWithin(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

function validUtcTimestamp(timestamp: string): boolean {
  if (!/^\d{8}T\d{6}Z$/.test(timestamp)) return false;
  const year = Number(timestamp.slice(0, 4));
  const month = Number(timestamp.slice(4, 6));
  const day = Number(timestamp.slice(6, 8));
  const hour = Number(timestamp.slice(9, 11));
  const minute = Number(timestamp.slice(11, 13));
  const second = Number(timestamp.slice(13, 15));
  const value = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return (
    value.getUTCFullYear() === year &&
    value.getUTCMonth() === month - 1 &&
    value.getUTCDate() === day &&
    value.getUTCHours() === hour &&
    value.getUTCMinutes() === minute &&
    value.getUTCSeconds() === second
  );
}

async function resolvePublicArtifactPath(
  workingDirectory: string | undefined,
  publishPath: string,
): Promise<string> {
  const match =
    /^\.agent\/testing\/workflows\/(\d{8}T\d{6}Z)\/(DAILY_FACTS|CRA_RED_GREEN)\.md$/.exec(
      publishPath,
    );
  if (!workingDirectory || isAbsolute(publishPath) || !match?.[1]) {
    throw new LocalJournalError(
      'ARTIFACT_PUBLIC_PATH_INVALID',
      'Public artifact path is not an admitted workflow proof report path.',
    );
  }
  if (!validUtcTimestamp(match[1])) {
    throw new LocalJournalError(
      'ARTIFACT_PUBLIC_PATH_INVALID',
      'Public artifact UTC timestamp is invalid.',
    );
  }
  const declaredRoot = resolve(workingDirectory);
  const root = await realpath(declaredRoot);
  const path = resolve(declaredRoot, publishPath);
  if (!isWithin(declaredRoot, path)) {
    throw new LocalJournalError(
      'ARTIFACT_PUBLIC_PATH_INVALID',
      'Public artifact path escaped the admitted working root.',
    );
  }
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const realParent = await realpath(dirname(path));
  if (!isWithin(root, realParent)) {
    throw new LocalJournalError(
      'ARTIFACT_PUBLIC_PATH_INVALID',
      'Public artifact parent resolves outside the admitted working root.',
    );
  }
  return path;
}

function updateNode(state: JournalState, event: Record<string, unknown>): void {
  if (event.type === 'node.frozen') {
    if (state.nodes.length >= MAX_NODES) {
      throw new LocalJournalError(
        'JOURNAL_LIMIT_EXCEEDED',
        'Journal node limit exceeded.',
      );
    }
    const node = event.node;
    if (typeof node === 'object' && node !== null) {
      state.nodes.push({
        ...(node as Record<string, unknown>),
        status: 'frozen',
      });
    }
    return;
  }
  if (!String(event.type ?? '').startsWith('node.')) return;
  const nodeId = event.nodeId;
  if (typeof nodeId !== 'string') return;
  const node = state.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) return;
  const status = String(event.type).slice('node.'.length);
  Object.assign(node, {
    status,
    ...(status === 'started' ? { startedAt: event.at } : {}),
    ...(['completed', 'failed', 'cancelled'].includes(status)
      ? { completedAt: event.at }
      : {}),
    ...(event.outcome === undefined ? {} : { outcome: event.outcome }),
    ...(event.durationMs === undefined ? {} : { durationMs: event.durationMs }),
    ...(event.outputDigest === undefined
      ? {}
      : { outputDigest: event.outputDigest }),
    ...(event.commandEvidence === undefined
      ? {}
      : { commandEvidence: event.commandEvidence }),
    ...(event.diagnostic === undefined ? {} : { diagnostic: event.diagnostic }),
    updatedAt: event.at,
  });
}

export async function createLocalRunJournal(
  options: CreateLocalRunJournalOptions,
): Promise<LocalRunJournal> {
  if (!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(options.runId)) {
    throw new LocalJournalError('RUN_ID_INVALID', 'Local run ID is invalid.');
  }
  const boundedRoot = resolve(options.root);
  const runDirectory = join(boundedRoot, 'runs', options.runId);
  const artifactsDirectory = join(runDirectory, 'artifacts');
  if (!runDirectory.startsWith(`${boundedRoot}${sep}`)) {
    throw new LocalJournalError(
      'RUN_ID_INVALID',
      'Local run path escaped root.',
    );
  }
  await mkdir(artifactsDirectory, { recursive: true, mode: 0o700 });
  const journalPath = join(runDirectory, 'journal.json');
  const state: JournalState = {
    schemaVersion: 1,
    authority: 'local-operational-journal',
    runId: options.runId,
    workflowId: options.workflowId,
    sourcePath: options.sourcePath,
    sourceDigest: options.sourceDigest,
    inputDigest: options.inputDigest,
    startedAt: options.startedAt,
    status: 'running',
    nodes: [],
    events: [],
    artifacts: [],
  };
  let writeSequence = 0;
  let tail = Promise.resolve();
  let finalized = false;
  const artifactNames = new Set<string>();

  const persist = (): Promise<void> => {
    writeSequence += 1;
    const temporary = join(
      runDirectory,
      `.journal-${process.pid}-${writeSequence}.tmp`,
    );
    const bytes = `${JSON.stringify(state, null, 2)}\n`;
    const operation = tail.then(async () => {
      await writeFile(temporary, bytes, { mode: 0o600 });
      await rename(temporary, journalPath);
    });
    tail = operation.catch(() => undefined);
    return operation;
  };
  await persist();

  return {
    journalPath,
    runDirectory,
    artifactsDirectory,
    async record(event) {
      if (finalized) {
        throw new LocalJournalError(
          'JOURNAL_FINALIZED',
          'A finalized journal cannot record more events.',
        );
      }
      if (state.events.length >= MAX_EVENTS) {
        throw new LocalJournalError(
          'JOURNAL_LIMIT_EXCEEDED',
          'Journal event limit exceeded.',
        );
      }
      const safe = sanitize(event) as Record<string, unknown>;
      state.events.push(safe);
      updateNode(state, safe);
      await persist();
    },
    async writeArtifact(request) {
      if (!validArtifactName(request.name)) {
        throw new LocalJournalError(
          'ARTIFACT_NAME_INVALID',
          'Artifact name must be a safe basename.',
        );
      }
      const publishedPath = request.publishPath
        ? await resolvePublicArtifactPath(
            options.workingDirectory,
            request.publishPath,
          )
        : undefined;
      if (finalized) {
        throw new LocalJournalError(
          'JOURNAL_FINALIZED',
          'A finalized journal cannot publish more artifacts.',
        );
      }
      if (artifactNames.has(request.name)) {
        throw new LocalJournalError(
          'ARTIFACT_ALREADY_EXISTS',
          'Artifact name is already reserved for this run.',
        );
      }
      artifactNames.add(request.name);
      const bytes = artifactBytes(request.value);
      if (bytes.byteLength > MAX_ARTIFACT_BYTES) {
        throw new LocalJournalError(
          'ARTIFACT_TOO_LARGE',
          'Artifact exceeds the local byte limit.',
        );
      }
      const path = join(artifactsDirectory, request.name);
      const privateTemporary = join(
        artifactsDirectory,
        `.${request.name}.${process.pid}.${randomUUID()}.tmp`,
      );
      const publicTemporary = publishedPath
        ? join(
            dirname(publishedPath),
            `.${basename(publishedPath)}.${process.pid}.${randomUUID()}.tmp`,
          )
        : undefined;
      let privatePublished = false;
      let publicPublished = false;
      let artifactRegistered = false;
      try {
        await writeFile(privateTemporary, bytes, {
          flag: 'wx',
          mode: 0o600,
        });
        if (publicTemporary) {
          await writeFile(publicTemporary, bytes, {
            flag: 'wx',
            mode: 0o600,
          });
        }
        if (publicTemporary && publishedPath) {
          await link(publicTemporary, publishedPath);
          publicPublished = true;
        }
        await link(privateTemporary, path);
        privatePublished = true;
        const artifact: WorkflowArtifact = Object.freeze({
          name: request.name,
          path,
          ...(publishedPath ? { publishedPath } : {}),
          digest: sha256(bytes),
          mediaType: request.mediaType ?? inferredMediaType(request.name),
        });
        state.artifacts.push(artifact);
        artifactRegistered = true;
        await persist();
        return artifact;
      } catch (error) {
        if (
          artifactRegistered &&
          state.artifacts.at(-1)?.name === request.name
        ) {
          state.artifacts.pop();
        }
        if (privatePublished) await rm(path, { force: true });
        if (publicPublished && publishedPath) {
          await rm(publishedPath, { force: true });
        }
        if (error instanceof LocalJournalError) throw error;
        const code =
          typeof error === 'object' && error !== null && 'code' in error
            ? String(error.code)
            : 'UNKNOWN';
        if (code === 'EEXIST') {
          throw new LocalJournalError(
            'ARTIFACT_ALREADY_EXISTS',
            'Artifact destination already exists.',
          );
        }
        throw new LocalJournalError(
          'ARTIFACT_WRITE_FAILED',
          'Artifact storage operation failed.',
        );
      } finally {
        await rm(privateTemporary, { force: true });
        if (publicTemporary) await rm(publicTemporary, { force: true });
      }
    },
    async finalize(outcome) {
      if (finalized) {
        throw new LocalJournalError(
          'JOURNAL_FINALIZED',
          'Journal was already finalized.',
        );
      }
      finalized = true;
      state.status = outcome.status;
      state.completedAt = outcome.completedAt;
      await persist();
    },
  };
}

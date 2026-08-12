import { createHash } from 'node:crypto';
import { chmod, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';

import { describe, expect, test } from 'vitest';

interface JournalApi {
  createLocalRunJournal(options: {
    root: string;
    runId: string;
    workflowId: string;
    sourcePath: string;
    sourceDigest: `sha256:${string}`;
    inputDigest: `sha256:${string}`;
    startedAt: string;
    workingDirectory?: string;
  }): Promise<{
    journalPath: string;
    runDirectory: string;
    artifactsDirectory: string;
    record(event: Record<string, unknown>): Promise<void>;
    writeArtifact(request: {
      name: string;
      value: unknown;
      mediaType?: string;
      publishPath?: string;
    }): Promise<{
      name: string;
      path: string;
      publishedPath?: string;
      digest: `sha256:${string}`;
      mediaType: string;
    }>;
    finalize(outcome: {
      status: 'completed' | 'failed' | 'cancelled';
      completedAt: string;
    }): Promise<void>;
  }>;
}

async function journalApi(): Promise<JournalApi> {
  const modulePath = './journal.js';
  let loaded: unknown;
  let failure: unknown;
  try {
    loaded = await import(modulePath);
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeUndefined();
  expect(loaded).toEqual(
    expect.objectContaining({ createLocalRunJournal: expect.any(Function) }),
  );
  return loaded as JournalApi;
}

// === L1: IN-PROCESS INTEGRATION TESTS ===

describe('[L1:INTEGRATION] bounded local workflow journal', () => {
  test('[L1:INTEGRATION] TS-GC2-006 atomically journals stable redacted state and persists bounded artifacts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-workflows-journal-'));
    try {
      const runtime = await journalApi();
      const journal = await runtime.createLocalRunJournal({
        root,
        runId: 'run-20260808-contract',
        workflowId: 'journal-contract',
        sourcePath: '/trusted/workflow.ts',
        sourceDigest: `sha256:${'1'.repeat(64)}`,
        inputDigest: `sha256:${'2'.repeat(64)}`,
        startedAt: '2026-08-08T12:00:00.000Z',
      });

      await journal.record({
        sequence: 1,
        type: 'node.frozen',
        at: '2026-08-08T12:00:00.010Z',
        node: {
          id: 'journal-contract:001:research',
          label: 'research',
          dependencies: [],
          model: 'gpt-5.6-luna',
          reasoning: 'medium',
          promptDigest: `sha256:${'3'.repeat(64)}`,
          inputDigest: `sha256:${'4'.repeat(64)}`,
          prompt: 'private prompt must be redacted',
          input: { secret: 'private input must be redacted' },
          environment: { API_KEY: 'private environment must be redacted' },
          rawError: 'private error must be redacted',
        },
      });
      const first = JSON.parse(
        await readFile(journal.journalPath, 'utf8'),
      ) as Record<string, unknown>;
      expect(first).toEqual(
        expect.objectContaining({
          schemaVersion: 1,
          authority: 'local-operational-journal',
          runId: 'run-20260808-contract',
          workflowId: 'journal-contract',
          status: 'running',
          events: expect.any(Array),
        }),
      );

      const artifact = await journal.writeArtifact({
        name: 'resolver-factory-proposal.md',
        value: '# Decision-ready proposal\n',
        mediaType: 'text/markdown',
      });
      expect(artifact).toEqual(
        expect.objectContaining({
          name: 'resolver-factory-proposal.md',
          path: join(
            journal.artifactsDirectory,
            'resolver-factory-proposal.md',
          ),
          digest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
          mediaType: 'text/markdown',
        }),
      );
      expect(await readFile(artifact.path, 'utf8')).toBe(
        '# Decision-ready proposal\n',
      );
      await journal.finalize({
        status: 'completed',
        completedAt: '2026-08-08T12:00:01.000Z',
      });

      const bytes = await readFile(journal.journalPath, 'utf8');
      const completed = JSON.parse(bytes) as {
        status?: string;
        artifacts?: unknown[];
      };
      expect(completed.status).toBe('completed');
      expect(completed.artifacts).toHaveLength(1);
      expect(bytes).not.toContain('private prompt');
      expect(bytes).not.toContain('private input');
      expect(bytes).not.toContain('private environment');
      expect(bytes).not.toContain('private error');
      expect(bytes).toContain(`sha256:${'3'.repeat(64)}`);
      expect(bytes).toContain(`sha256:${'4'.repeat(64)}`);
      expect(
        (await readdir(journal.runDirectory)).some((name) =>
          name.endsWith('.tmp'),
        ),
      ).toBe(false);
      await expect(
        journal.writeArtifact({ name: '../escape.txt', value: 'escape' }),
      ).rejects.toEqual(
        expect.objectContaining({ code: 'ARTIFACT_NAME_INVALID' }),
      );
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test('[L1:INTEGRATION] DF-GC1-003 redacts secret-bearing keys case-insensitively at every nesting depth', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-workflows-redaction-'));
    const seededSecrets = [
      'token-secret',
      'api-key-secret',
      'password-secret',
      'authorization-secret',
      'credentials-secret',
      'cookie-secret',
      'nested-mixed-case-secret',
    ];
    try {
      const runtime = await journalApi();
      const journal = await runtime.createLocalRunJournal({
        root,
        runId: 'df-redaction-red',
        workflowId: 'daily-facts-redaction',
        sourcePath: '/trusted/daily-facts.workflow.ts',
        sourceDigest: `sha256:${'a'.repeat(64)}`,
        inputDigest: `sha256:${'b'.repeat(64)}`,
        startedAt: '2026-08-10T17:00:00.000Z',
      });

      await journal.record({
        sequence: 1,
        type: 'diagnostic',
        token: seededSecrets[0],
        apiKey: seededSecrets[1],
        PASSWORD: seededSecrets[2],
        Authorization: seededSecrets[3],
        credentials: seededSecrets[4],
        cookie: seededSecrets[5],
        nested: [{ ApI_ToKeN: seededSecrets[6] }],
        safe: { status: 'bounded-diagnostic-retained' },
      });

      const bytes = await readFile(journal.journalPath, 'utf8');
      for (const secret of seededSecrets) expect(bytes).not.toContain(secret);
      expect(bytes).toContain('bounded-diagnostic-retained');
      expect(bytes.match(/\[redacted\]/g)?.length).toBe(seededSecrets.length);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test('[L1:INTEGRATION] DF-GC1-004 serializes or rejects duplicate artifact names deterministically with unique atomic temporary files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-workflows-artifact-'));
    try {
      const runtime = await journalApi();
      const journal = await runtime.createLocalRunJournal({
        root,
        runId: 'df-artifact-red',
        workflowId: 'daily-facts-artifact',
        sourcePath: '/trusted/daily-facts.workflow.ts',
        sourceDigest: `sha256:${'c'.repeat(64)}`,
        inputDigest: `sha256:${'d'.repeat(64)}`,
        startedAt: '2026-08-10T17:00:00.000Z',
      });

      const outcomes = await Promise.allSettled([
        journal.writeArtifact({ name: 'collision.md', value: 'first\n' }),
        journal.writeArtifact({ name: 'collision.md', value: 'second\n' }),
      ]);
      const fulfilled = outcomes.filter(
        (
          outcome,
        ): outcome is PromiseFulfilledResult<{
          name: string;
          path: string;
          publishedPath?: string;
          digest: `sha256:${string}`;
          mediaType: string;
        }> => outcome.status === 'fulfilled',
      );
      const rejected = outcomes.filter(
        (outcome): outcome is PromiseRejectedResult =>
          outcome.status === 'rejected',
      );
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]?.reason).toEqual(
        expect.objectContaining({ code: 'ARTIFACT_ALREADY_EXISTS' }),
      );
      const publishedBytes = await readFile(
        fulfilled[0]?.value.path ?? '',
        'utf8',
      );
      expect(['first\n', 'second\n']).toContain(publishedBytes);

      await journal.finalize({
        status: 'completed',
        completedAt: '2026-08-10T17:00:01.000Z',
      });
      await expect(
        journal.writeArtifact({ name: 'after-finalize.md', value: 'late\n' }),
      ).rejects.toEqual(expect.objectContaining({ code: 'JOURNAL_FINALIZED' }));
      expect(
        (await readdir(journal.artifactsDirectory)).some((name) =>
          name.endsWith('.tmp'),
        ),
      ).toBe(false);
      expect(
        (await readdir(journal.runDirectory)).some((name) =>
          name.endsWith('.tmp'),
        ),
      ).toBe(false);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test('[L1:INTEGRATION] DF-GC1-004 classifies an injected storage write failure and removes temporary files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-workflows-storage-fail-'));
    try {
      const runtime = await journalApi();
      const journal = await runtime.createLocalRunJournal({
        root,
        runId: 'df-artifact-storage-failure',
        workflowId: 'daily-facts-artifact-storage-failure',
        sourcePath: '/trusted/daily-facts.workflow.ts',
        sourceDigest: `sha256:${'7'.repeat(64)}`,
        inputDigest: `sha256:${'8'.repeat(64)}`,
        startedAt: '2026-08-10T17:00:00.000Z',
      });

      await chmod(journal.artifactsDirectory, 0o500);
      try {
        await expect(
          journal.writeArtifact({
            name: 'storage-failure.md',
            value: 'must not publish\n',
          }),
        ).rejects.toEqual(
          expect.objectContaining({ code: 'ARTIFACT_WRITE_FAILED' }),
        );
      } finally {
        await chmod(journal.artifactsDirectory, 0o700);
      }
      expect(await readdir(journal.artifactsDirectory)).toEqual([]);
      expect(
        (await readdir(journal.runDirectory)).some((name) =>
          name.endsWith('.tmp'),
        ),
      ).toBe(false);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test('[L1:INTEGRATION] DF-GC1-004 preserves exact artifact bytes and their SHA-256 digest', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-workflows-digest-'));
    try {
      const runtime = await journalApi();
      const journal = await runtime.createLocalRunJournal({
        root,
        runId: 'df-artifact-byte-digest',
        workflowId: 'daily-facts-artifact-byte-digest',
        sourcePath: '/trusted/daily-facts.workflow.ts',
        sourceDigest: `sha256:${'9'.repeat(64)}`,
        inputDigest: `sha256:${'0'.repeat(64)}`,
        startedAt: '2026-08-10T17:00:00.000Z',
      });
      const bytes = 'exact artifact bytes\n';
      const artifact = await journal.writeArtifact({
        name: 'digest.md',
        value: bytes,
      });
      expect(await readFile(artifact.path, 'utf8')).toBe(bytes);
      expect(artifact.digest).toBe(
        `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
      );
      expect(
        (await readdir(journal.artifactsDirectory)).some((name) =>
          name.endsWith('.tmp'),
        ),
      ).toBe(false);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test('[L1:INTEGRATION] DF-GC1-010 atomically publishes the exact root-contained public UTC report with one digest', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-workflows-public-'));
    const stateRoot = join(root, 'state');
    const publicPath =
      '.agent/testing/workflows/20260810T170000Z/DAILY_FACTS.md';
    try {
      const runtime = await journalApi();
      const journal = await runtime.createLocalRunJournal({
        root: stateRoot,
        workingDirectory: root,
        runId: 'df-public-report-red',
        workflowId: 'daily-facts-public-report',
        sourcePath: join(root, 'daily-facts.workflow.ts'),
        sourceDigest: `sha256:${'e'.repeat(64)}`,
        inputDigest: `sha256:${'f'.repeat(64)}`,
        startedAt: '2026-08-10T17:00:00.000Z',
      });

      const artifact = await journal.writeArtifact({
        name: 'DAILY_FACTS.md',
        value: '# Daily Facts\n',
        mediaType: 'text/markdown',
        publishPath: publicPath,
      });
      expect(artifact.publishedPath).toBe(join(root, publicPath));
      expect(await readFile(join(root, publicPath), 'utf8')).toBe(
        '# Daily Facts\n',
      );
      expect(await readFile(artifact.path, 'utf8')).toBe('# Daily Facts\n');

      const craPublicPath =
        '.agent/testing/workflows/20260810T170000Z/CRA_RED_GREEN.md';
      const craArtifact = await journal.writeArtifact({
        name: 'CRA_RED_GREEN.md',
        value: '# CRA RED to GREEN\n',
        mediaType: 'text/markdown',
        publishPath: craPublicPath,
      });
      expect(craArtifact.publishedPath).toBe(join(root, craPublicPath));
      expect(await readFile(join(root, craPublicPath), 'utf8')).toBe(
        '# CRA RED to GREEN\n',
      );

      for (const invalid of [
        '.agent/testing/workflows/not-utc/DAILY_FACTS.md',
        '.agent/testing/workflows/20260810T170000Z/OTHER.md',
        '../DAILY_FACTS.md',
        '/tmp/DAILY_FACTS.md',
      ]) {
        await expect(
          journal.writeArtifact({
            name: 'DAILY_FACTS.md',
            value: 'invalid\n',
            publishPath: invalid,
          }),
        ).rejects.toEqual(
          expect.objectContaining({ code: 'ARTIFACT_PUBLIC_PATH_INVALID' }),
        );
      }
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

import { Client } from 'pg';
import { describe, expect, it } from 'vitest';

import { createProcessPostgresFixture } from './support/postgres-fixture.js';

const candidateDigest = `sha256:${'a'.repeat(64)}`;

// === L2: REAL-BOUNDARY INTEGRATION TESTS ===
describe('[L2:INTEGRATION] real PostgreSQL process migration', () => {
  it('PR1-L2-001 applies twice and installs immutable process tables', async () => {
    const fixture = await createProcessPostgresFixture();
    const sql = await readFile(resolve('migrations/process/001_process_control.sql'), 'utf8');
    const client = new Client({ connectionString: fixture.ownerUrl });
    await client.connect();
    try {
      await client.query(sql);
      const tables = await client.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'process' ORDER BY table_name",
      );
      expect(tables.rows.map((row) => row.table_name)).toEqual(
        expect.arrayContaining(['candidate', 'event', 'artifact', 'projection']),
      );
    } finally {
      await client.end();
      await fixture.close();
    }
  });

  it('PR1-CLOSE-001 resolves stale counts and proof pointers append-only', async () => {
    const countSuccessor = JSON.parse(
      await readFile(
        resolve(
          'packages/testing/evidence/codex-workflows-proof-recovery-count-successor.json',
        ),
        'utf8',
      ),
    ) as Record<string, unknown>;
    const referenceAddendum = JSON.parse(
      await readFile(
        resolve(
          'packages/testing/evidence/codex-workflows-proof-recovery-reference-addendum.json',
        ),
        'utf8',
      ),
    ) as Record<string, unknown>;
    expect(countSuccessor).toMatchObject({
      status: 'append-only-successor',
      nativeExecuted: 57,
      predecessor: {
        sha256:
          'sha256:971c03d67f09cb95b3ad33de696f200994058a64b244a7b8a41dcdcd73da0d62',
      },
    });
    expect(referenceAddendum).toMatchObject({
      status: 'append-only-reference-addendum',
      red: {
        historicalDeclaredSha256:
          'sha256:87b203315d8435e45bafa81fcb15954a1e900e773de93d3da6449f626e252bd3',
        currentSha256:
          'sha256:11f4ca4882d1b0109cc9b363582b0525760515d01b4173bea50353cdab476bea',
      },
      reproof: {
        historicalDeclaredSha256:
          'sha256:2769d81f40e0a1ef9e1053716ce46bb9ba7bf0da5039428ba2c188d2715d6e71',
        currentSha256:
          'sha256:971c03d67f09cb95b3ad33de696f200994058a64b244a7b8a41dcdcd73da0d62',
      },
    });
  });
});

// === L2: END-TO-END TESTS ===
describe('[L2:E2E] scoped public process CLI', () => {
  it('PR1-L2-002 registers a candidate through the real coordinator command', async () => {
    const fixture = await createProcessPostgresFixture();
    const directory = await mkdtemp(`${tmpdir()}/codex-process-spec-`);
    const manifest = resolve(directory, 'candidate.json');
    await writeFile(manifest, JSON.stringify({ algorithm: { name: 'test-v1' }, paths: ['a'] }));
    try {
      const child = spawn(
        'bun',
        [
          'packages/process/src/cli.ts',
          'candidate',
          'register',
          '--epoch',
          'founder-recovery-test',
          '--attempt',
          '1',
          '--workspace',
          process.cwd(),
          '--base',
          '1111111',
          '--head',
          '2222222',
          '--digest',
          candidateDigest,
          '--path-count',
          '1',
          '--manifest',
          manifest,
          '--idempotency-key',
          'spec-candidate-1',
        ],
        {
          env: {
            ...process.env,
            PROCESS_COORDINATOR_DATABASE_URL: fixture.coordinatorUrl,
          },
        },
      );
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
      child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
      const exitCode = await new Promise<number | null>((resolveExit, reject) => {
        child.once('error', reject);
        child.once('close', resolveExit);
      });
      expect(exitCode, Buffer.concat(stderr).toString('utf8')).toBe(0);
      expect(JSON.parse(Buffer.concat(stdout).toString('utf8'))).toMatchObject({
        status: 'registered',
        projection: 'registered',
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
      await fixture.close();
    }
  });
});

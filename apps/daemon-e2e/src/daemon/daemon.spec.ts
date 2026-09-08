import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import { Client } from 'pg';

import { createControlDatabaseFixture } from './support/control-database-fixture.js';

async function startAndStopDaemon(
  processDatabaseUrl: string,
  ownerUrl: string,
  runtimeConfigPath: string,
) {
  const environment = { ...process.env };
  delete environment.FORCE_COLOR;
  delete environment.NO_COLOR;
  const child = spawn(
    process.execPath,
    [resolve('apps/daemon/dist/bootstrap.js')],
    {
      env: {
        ...environment,
        PROCESS_DAEMON_DATABASE_URL: processDatabaseUrl,
        POSTGRES_URL: ownerUrl,
        CODEX_CONTROL_RUNTIME_CONFIG: runtimeConfigPath,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });

  await expect
    .poll(() => stdout, { timeout: 15_000, interval: 50 })
    .toContain('"status":"ready"');
  expect(child.kill('SIGTERM')).toBe(true);
  const exit = await new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>((resolveExit, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolveExit({ code, signal }));
  });
  return { stdout, stderr, ...exit };
}

// === L2: REAL-BOUNDARY INTEGRATION TESTS ===

// === L2: END-TO-END TESTS ===
describe('[L2:E2E] durable control daemon process boundary', () => {
  it('CAS03-L2-DAEMON starts, reports ready, stops cleanly, and restarts', async () => {
    const fixture = await createControlDatabaseFixture();
    const root = await mkdtemp(join(tmpdir(), 'cas-09-r2-process-'));
    const uiDirectory = join(root, 'ui');
    const tokenFile = join(root, 'token');
    const workflowModule = join(root, 'workflow.mjs');
    const runtimeConfigPath = join(root, 'runtime.json');
    await mkdir(uiDirectory);
    await writeFile(join(uiDirectory, 'index.html'), '<h1>Codex Control</h1>');
    await writeFile(tokenFile, 'a'.repeat(64), { mode: 0o600 });
    await writeFile(workflowModule, 'export default {};');
    await writeFile(
      runtimeConfigPath,
      JSON.stringify({
        hosts: [
          {
            hostId: 'local',
            transport: 'local-proxy',
            expectedVersion: '0.151.0',
          },
        ],
        repositories: [
          {
            hostId: 'local',
            repositoryId: 'codex',
            checkoutPath: root,
            leaseRoot: root,
          },
        ],
        workflows: [
          { workflowRef: 'trusted.workflow', modulePath: workflowModule },
        ],
        viewer: {
          host: '127.0.0.1',
          port: 0,
          tokenFile,
          uiDirectory,
        },
      }),
    );
    try {
      const owner = new Client({ connectionString: fixture.ownerUrl });
      await owner.connect();
      try {
        for (const name of [
          '003_agent_messaging.sql',
          '004_agent_delegation.sql',
          '005_runtime_visibility.sql',
          '006_visibility_source_reads.sql',
        ])
          await owner.query(
            await readFile(resolve('migrations/process', name), 'utf8'),
          );
      } finally {
        await owner.end();
      }
      for (let incarnation = 0; incarnation < 2; incarnation += 1) {
        await expect(
          startAndStopDaemon(
            fixture.daemonUrl,
            fixture.ownerUrl,
            runtimeConfigPath,
          ),
        ).resolves.toMatchObject({
          code: 0,
          signal: null,
          stderr: '',
          stdout: expect.stringContaining('Codex control daemon ready'),
        });
      }
    } finally {
      await fixture.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});

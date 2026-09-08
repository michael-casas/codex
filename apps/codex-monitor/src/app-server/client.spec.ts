import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { afterEach, describe, expect, it } from 'vitest';

import { AmbiguousDisconnect, AppServerClient } from './client.js';

// === L2: REAL-BOUNDARY INTEGRATION TESTS ===
describe('[L2:INTEGRATION] App Server boundary', () => {
  const directories: string[] = [];
  const fixture = fileURLToPath(
    new URL('../../tests/fake-app-server.ts', import.meta.url),
  );
  const cli = fileURLToPath(
    new URL('../../bin/codex-monitor-app-server-spike', import.meta.url),
  );

  afterEach(() => {
    for (const directory of directories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  function command(mode: 'normal' | 'eof' | 'silent', store?: string): string[] {
    const directory = mkdtempSync(join(tmpdir(), 'codex-monitor-server-'));
    directories.push(directory);
    const wrapper = join(directory, 'fake-codex');
    writeFileSync(
      wrapper,
      `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "codex-cli 0.151.0"; exit 0; fi\nexec bun ${JSON.stringify(fixture)} "$@"\n`,
    );
    chmodSync(wrapper, 0o700);
    return [wrapper, mode, ...(store ? [store] : [])];
  }

  function codexExecutable(store: string): string {
    const directory = mkdtempSync(join(tmpdir(), 'codex-monitor-cli-server-'));
    directories.push(directory);
    const wrapper = join(directory, 'fake-codex');
    writeFileSync(
      wrapper,
      `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "codex-cli 0.151.0"; exit 0; fi\nexec bun ${JSON.stringify(fixture)} normal ${JSON.stringify(store)}\n`,
    );
    chmodSync(wrapper, 0o700);
    return wrapper;
  }

  it('test_real_child_stream_and_reconnect_read', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'codex-monitor-store-'));
    directories.push(directory);
    const store = join(directory, 'store.txt');
    const client = new AppServerClient(command('normal', store));
    const outcome = await client.submit('thread-1', 'marker-unique');
    expect(outcome.turn_id).toBe('turn-fake');
    expect(outcome.terminal).toBe(true);
    const readback = await new AppServerClient(
      command('normal', store),
    ).readThread('thread-1');
    expect(AppServerClient.containsMarker(readback, 'marker-unique')).toBe(
      true,
    );
  });

  it('test_eof_after_submission_is_ambiguous_not_retried', async () => {
    const client = new AppServerClient(command('eof'));
    await expect(client.submit('thread-1', 'marker')).rejects.toBeInstanceOf(
      AmbiguousDisconnect,
    );
  });

  it('times out and reaps a child silent after accepting a turn', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'codex-monitor-silent-'));
    directories.push(directory);
    const store = join(directory, 'store.txt');
    const client = new AppServerClient(command('silent', store), 0.5);
    const started = Date.now();
    const submission = client.submit('thread-1', 'marker');
    try {
      await expect(submission).rejects.toMatchObject({
        code: 'REQUEST_ABORTED',
      });
      expect(Date.now() - started).toBeLessThan(1_200);
    } finally {
      await submission.catch(() => undefined);
      expect(readFileSync(store, 'utf8')).toBe('marker');
      const pid = Number(readFileSync(`${store}.pid`, 'utf8'));
      expect(() => process.kill(pid, 0)).toThrow();
    }
  });

  it('preserves the root help contract', () => {
    const result = spawnSync(cli, ['--help'], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      'usage: codex-monitor-app-server-spike [-h] {arm,worker} ...',
    );
  });

  it('rejects a missing command with argparse-compatible exit 2', () => {
    const result = spawnSync(cli, [], { encoding: 'utf8' });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain(
      'the following arguments are required: command',
    );
  });

  it('rejects zero seconds before spawning a worker', () => {
    const directory = mkdtempSync(join(tmpdir(), 'codex-monitor-cli-'));
    directories.push(directory);
    const result = spawnSync(
      cli,
      [
        'arm',
        '--seconds',
        '0',
        '--thread-id',
        'thread-1',
        '--memo',
        'memo',
        '--cwd',
        directory,
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, CODEX_HOME: join(directory, 'codex-home') },
      },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toBe('--seconds must be positive\n');
  });

  it('arms a real Bun worker and reconciles the persisted marker', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'codex-monitor-cli-arm-'));
    directories.push(directory);
    const codexHome = join(directory, 'codex-home');
    const store = join(directory, 'store.txt');
    const result = spawnSync(
      cli,
      [
        'arm',
        '--seconds',
        '1',
        '--thread-id',
        'thread-1',
        '--memo',
        'persist marker',
        '--cwd',
        directory,
        '--codex-bin',
        codexExecutable(store),
        '--launcher',
        'process',
      ],
      { encoding: 'utf8', env: { ...process.env, CODEX_HOME: codexHome } },
    );
    expect(result.status, result.stderr || result.stdout).toBe(0);
    const armed = JSON.parse(result.stdout) as {
      pid: number;
      state: string;
      launcher: string;
    };
    let state:
      | {
          phase: string;
          marker: string;
          modelAffinity: string;
          submission_suppressed?: boolean;
        }
      | undefined;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      state = JSON.parse(readFileSync(armed.state, 'utf8')) as typeof state;
      if (state?.phase === 'persisted_reconciled') break;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    }
    expect(armed.launcher).toBe('process');
    expect(state?.phase).toBe('persisted_reconciled');
    expect(state?.modelAffinity).toBe('inherit');
    expect(state?.submission_suppressed).not.toBe(true);
    expect(readFileSync(store, 'utf8')).toBe(state?.marker);
    expect(() => process.kill(armed.pid, 0)).toThrow();
  });
});

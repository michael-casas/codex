import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { waitForCondition } from './monitor-conditions.js';

// === L2: REAL-BOUNDARY INTEGRATION TESTS ===
describe('[L2:INTEGRATION] monitor process boundaries', () => {
  const directories: string[] = [];
  const syncMonitor = fileURLToPath(
    new URL('./sync-monitor.ts', import.meta.url),
  );
  const monitor = fileURLToPath(new URL('./monitor', import.meta.url));
  const monitorCompatibility = fileURLToPath(
    new URL('./monitor.mjs', import.meta.url),
  );
  const syncCompatibility = fileURLToPath(
    new URL('./sync-monitor.mjs', import.meta.url),
  );

  afterEach(() => {
    for (const directory of directories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  function temporary(prefix: string): string {
    const directory = mkdtempSync(join(tmpdir(), prefix));
    directories.push(directory);
    return directory;
  }

  it('file_exists and file_matches resolve concrete targets', async () => {
    const path = join(temporary('codex-monitor-test-'), 'ready.txt');
    writeFileSync(path, 'status: READY\n');
    const controller = new AbortController();
    await expect(
      waitForCondition({ kind: 'file_exists', path }, 10, controller.signal),
    ).resolves.toEqual({ path });
    await expect(
      waitForCondition(
        { kind: 'file_matches', path, contains: 'READY' },
        10,
        controller.signal,
      ),
    ).resolves.toEqual({ path, matched: 'READY' });
  });

  it('custom_command returns captured output on exit zero', async () => {
    const controller = new AbortController();
    const result = await waitForCondition(
      { kind: 'custom_command', command: "printf 'monitor-ready'" },
      10,
      controller.signal,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('monitor-ready');
  });

  it('synchronous monitor stalls the active caller until a regular file matches', async () => {
    const path = join(temporary('codex-sync-monitor-test-'), 'AUDIT.md');
    const child = spawn(
      'bun',
      [
        syncMonitor,
        path,
        '--contains',
        'EXTERNAL_AUDIT_COMPLETE',
        '--timeout',
        '2',
        '--interval',
        '50',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
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
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    writeFileSync(path, 'EXTERNAL_AUDIT_COMPLETE\n');
    const exitCode = await new Promise<number | null>((resolveExit, reject) => {
      child.once('error', reject);
      child.once('close', resolveExit);
    });
    expect(exitCode, stderr).toBe(0);
    expect(stdout).toMatch(/^WAITING /m);
    expect(stdout).toMatch(/^CONDITION_MET /m);
  });

  it('synchronous monitor times out with exit 124', () => {
    const directory = temporary('codex-sync-monitor-timeout-');
    const result = spawnSync(
      'bun',
      [
        syncMonitor,
        join(directory, 'missing.md'),
        '--timeout',
        '0.05',
        '--interval',
        '50',
      ],
      { encoding: 'utf8' },
    );
    expect(result.status).toBe(124);
    expect(result.stderr).toMatch(/^TIMEOUT /m);
  });

  it('preserves the Node-compatible mjs entrypoint callers', async () => {
    const help = spawnSync(process.execPath, [monitorCompatibility, '--help'], {
      encoding: 'utf8',
    });
    expect(help.status, help.stderr || help.stdout).toBe(0);
    expect(help.stdout).toContain('monitor arm');

    const directory = temporary('codex-sync-monitor-compatibility-');
    const timeout = spawnSync(
      process.execPath,
      [
        syncCompatibility,
        join(directory, 'missing.md'),
        '--timeout',
        '0.05',
        '--interval',
        '50',
      ],
      { encoding: 'utf8' },
    );
    expect(timeout.status).toBe(124);
    expect(timeout.stderr).toMatch(/^TIMEOUT /m);

    const canceled = spawn(
      process.execPath,
      [syncCompatibility, join(directory, 'waiting.md'), '--interval', '50'],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    await new Promise<void>((resolveWaiting, reject) => {
      canceled.once('error', reject);
      canceled.stdout.once('data', () => resolveWaiting());
    });
    canceled.kill('SIGTERM');
    const canceledExit = await new Promise<number | null>((resolveExit) =>
      canceled.once('close', resolveExit),
    );
    expect(canceledExit).toBe(143);
  });

  it('tmux boomerang environment self-tears down after wake completion', async () => {
    expect(spawnSync('tmux', ['-V']).status).toBe(0);
    const monitorHome = temporary('codex-monitor-integration-');
    const armedResult = spawnSync(
      monitor,
      [
        'arm',
        '--thread-id',
        'integration-test-thread',
        '--condition',
        JSON.stringify({ kind: 'timed', seconds: 1 }),
        '--memo',
        'verify tmux teardown',
        '--wake-mode',
        'log-only',
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          CODEX_MONITOR_HOME: monitorHome,
          CODEX_MONITOR_ALLOW_TEST_WAKE: '1',
        },
      },
    );
    expect(armedResult.status, armedResult.stderr || armedResult.stdout).toBe(
      0,
    );
    const armed = JSON.parse(armedResult.stdout) as {
      handle: string;
      tmuxSession: string;
    };
    const statePath = join(monitorHome, 'handles', `${armed.handle}.json`);
    try {
      let state: Record<string, unknown> | undefined;
      for (let attempt = 0; attempt < 50; attempt += 1) {
        state = JSON.parse(readFileSync(statePath, 'utf8')) as Record<
          string,
          unknown
        >;
        const wake = state.wake as { status: string };
        if (state.state === 'met' && wake.status === 'completed') break;
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
      }
      const wake = state?.wake as { status: string };
      expect(state?.state).toBe('met');
      expect(wake.status).toBe('completed');
      expect(state?.launcher).toBe('tmux');
      expect(state?.modelAffinity).toBe('inherit');
      expect(
        spawnSync('tmux', ['has-session', '-t', armed.tmuxSession]).status,
      ).toBe(1);
      const statusResult = spawnSync(
        monitor,
        ['status', '--handle', armed.handle],
        {
          encoding: 'utf8',
          env: { ...process.env, CODEX_MONITOR_HOME: monitorHome },
        },
      );
      expect(
        statusResult.status,
        statusResult.stderr || statusResult.stdout,
      ).toBe(0);
      expect(JSON.parse(statusResult.stdout).runtime).toEqual({
        workerAlive: false,
        tmuxSessionAlive: false,
      });
    } finally {
      if (
        spawnSync('tmux', ['has-session', '-t', armed.tmuxSession]).status === 0
      ) {
        spawnSync('tmux', ['kill-session', '-t', armed.tmuxSession]);
      }
    }
  });

  it('production wake waits for host dispatch and can be polled and acknowledged', async () => {
    expect(spawnSync('tmux', ['-V']).status).toBe(0);
    const monitorHome = temporary('codex-monitor-host-dispatch-');
    const environment = { ...process.env, CODEX_MONITOR_HOME: monitorHome };
    const armedResult = spawnSync(
      monitor,
      [
        'arm',
        '--thread-id',
        'integration-test-thread',
        '--condition',
        JSON.stringify({ kind: 'timed', seconds: 1 }),
        '--memo',
        'verify host dispatch boundary',
      ],
      { encoding: 'utf8', env: environment },
    );
    expect(armedResult.status, armedResult.stderr || armedResult.stdout).toBe(
      0,
    );
    const armed = JSON.parse(armedResult.stdout) as {
      handle: string;
      tmuxSession: string;
    };
    const statePath = join(monitorHome, 'handles', `${armed.handle}.json`);
    try {
      let state: Record<string, unknown> | undefined;
      for (let attempt = 0; attempt < 50; attempt += 1) {
        state = JSON.parse(readFileSync(statePath, 'utf8')) as Record<
          string,
          unknown
        >;
        const wake = state.wake as { status: string };
        if (state.state === 'met' && wake.status === 'awaiting_host_dispatch') {
          break;
        }
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
      }
      const wake = state?.wake as {
        status: string;
        backend: string;
        content: string;
      };
      expect(state?.state).toBe('met');
      expect(wake.status).toBe('awaiting_host_dispatch');
      expect(wake.backend).toBe('desktop-heartbeat');
      expect(wake.content.split('\n')[0]).toBe('MONITOR EVENT');
      expect(state?.deliveryBackend).toBe('desktop-heartbeat');
      expect(
        spawnSync('tmux', ['has-session', '-t', armed.tmuxSession]).status,
      ).toBe(1);

      const pollResult = spawnSync(
        monitor,
        ['poll', '--handle', armed.handle],
        { encoding: 'utf8', env: environment },
      );
      expect(pollResult.status, pollResult.stderr || pollResult.stdout).toBe(0);
      const polled = JSON.parse(pollResult.stdout) as Record<string, unknown>;
      expect(polled.ready).toBe(true);
      expect(polled.stop).toBe(false);
      expect(polled.threadId).toBe('integration-test-thread');
      expect(polled.wakeText).toBe(wake.content);

      const rejected = spawnSync(
        monitor,
        ['acknowledge', '--handle', armed.handle],
        { encoding: 'utf8', env: environment },
      );
      expect(rejected.status).toBe(1);
      expect(rejected.stderr).toMatch(
        /--delivery host-message-accepted is required/,
      );

      const acknowledged = spawnSync(
        monitor,
        [
          'acknowledge',
          '--handle',
          armed.handle,
          '--delivery',
          'host-message-accepted',
        ],
        { encoding: 'utf8', env: environment },
      );
      expect(
        acknowledged.status,
        acknowledged.stderr || acknowledged.stdout,
      ).toBe(0);
      expect(JSON.parse(acknowledged.stdout).acknowledged).toBe(true);

      const after = JSON.parse(readFileSync(statePath, 'utf8')) as {
        wake: { status: string; transport: string };
      };
      expect(after.wake.status).toBe('host_message_accepted');
      expect(after.wake.transport).toBe('send_message_to_thread');
      const finalPoll = spawnSync(monitor, ['poll', '--handle', armed.handle], {
        encoding: 'utf8',
        env: environment,
      });
      expect(finalPoll.status, finalPoll.stderr || finalPoll.stdout).toBe(0);
      expect(JSON.parse(finalPoll.stdout).stop).toBe(true);
    } finally {
      if (
        spawnSync('tmux', ['has-session', '-t', armed.tmuxSession]).status === 0
      ) {
        spawnSync('tmux', ['kill-session', '-t', armed.tmuxSession]);
      }
    }
  });

  it('flush cancels the worker and suppresses its wake', async () => {
    expect(spawnSync('tmux', ['-V']).status).toBe(0);
    const monitorHome = temporary('codex-monitor-cancel-');
    const environment = {
      ...process.env,
      CODEX_MONITOR_HOME: monitorHome,
      CODEX_MONITOR_ALLOW_TEST_WAKE: '1',
    };
    const armedResult = spawnSync(
      monitor,
      [
        'arm',
        '--thread-id',
        'integration-test-thread',
        '--condition',
        JSON.stringify({ kind: 'timed', seconds: 30 }),
        '--memo',
        'verify cancellation',
        '--wake-mode',
        'log-only',
      ],
      { encoding: 'utf8', env: environment },
    );
    expect(armedResult.status, armedResult.stderr || armedResult.stdout).toBe(
      0,
    );
    const armed = JSON.parse(armedResult.stdout) as {
      handle: string;
      tmuxSession: string;
    };
    const statePath = join(monitorHome, 'handles', `${armed.handle}.json`);
    try {
      const flushed = spawnSync(monitor, ['flush', '--handle', armed.handle], {
        encoding: 'utf8',
        env: environment,
      });
      expect(flushed.status, flushed.stderr || flushed.stdout).toBe(0);
      expect(JSON.parse(flushed.stdout).flushed).toBe(true);
      let state: { state: string; wake: { status: string } } | undefined;
      for (let attempt = 0; attempt < 50; attempt += 1) {
        state = JSON.parse(readFileSync(statePath, 'utf8')) as typeof state;
        if (state?.state === 'aborted') break;
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
      }
      expect(state?.state).toBe('aborted');
      expect(state?.wake.status).toBe('suppressed');
      expect(
        spawnSync('tmux', ['has-session', '-t', armed.tmuxSession]).status,
      ).toBe(1);
    } finally {
      if (
        spawnSync('tmux', ['has-session', '-t', armed.tmuxSession]).status === 0
      ) {
        spawnSync('tmux', ['kill-session', '-t', armed.tmuxSession]);
      }
    }
  });
});

import { execFileSync } from 'node:child_process';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, test } from 'vitest';

import {
  initializeCodexHost,
  resetCodexHostForTests,
  type CodexAdapterFactory,
  type CodexHost,
} from '../index.js';
import { createCodexSdkAdapter } from './adapter.js';

// === L2: REAL-BOUNDARY INTEGRATION TESTS ===

const executable = fileURLToPath(
  new URL('../fixtures/controlled-codex.mjs', import.meta.url),
);

async function readTrace(path: string) {
  const source = await readFile(path, 'utf8');
  return source
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

async function waitForStarted(path: string): Promise<number> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const started = (await readTrace(path)).find(
        (entry) => entry.type === 'started',
      );
      if (typeof started?.pid === 'number') return started.pid;
    } catch {
      // The controlled process has not created its trace yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('controlled Codex process did not start');
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function host(tracePath: string): CodexHost {
  return initializeCodexHost({
    codexPathOverride: executable,
    env: {
      CODEX_TEST_TRACE: tracePath,
      PATH: process.env.PATH ?? '/usr/bin:/bin',
    },
  });
}

afterEach(() => {
  resetCodexHostForTests();
});

describe('[L2:INTEGRATION] real Codex SDK adapter boundary', () => {
  test('[L2:INTEGRATION] CWF-AUD-001 binds a real child to the admitted snapshot after caller mutation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-sdk-immutable-host-'));
    const admittedTrace = join(root, 'admitted.jsonl');
    const mutatedTrace = join(root, 'mutated.jsonl');
    await writeFile(admittedTrace, '');
    await writeFile(mutatedTrace, '');
    await chmod(executable, 0o755);
    try {
      const config = {
        codexPathOverride: executable,
        apiKey: 'child-secret-before',
        config: { audit_marker: 'before' },
        env: {
          CODEX_TEST_TRACE: admittedTrace,
          PATH: process.env.PATH ?? '/usr/bin:/bin',
          SECRET_VALUE: 'env-secret-before',
        },
      };
      const runtime = initializeCodexHost(config);
      const fingerprint = runtime.diagnostics.fingerprint;

      config.apiKey = 'child-secret-after';
      config.config.audit_marker = 'after';
      config.env.CODEX_TEST_TRACE = mutatedTrace;
      config.env.SECRET_VALUE = 'env-secret-after';

      await runtime.runTurn({ prompt: 'immutable host snapshot' });
      const admitted = await readTrace(admittedTrace);
      const mutated = await readTrace(mutatedTrace);
      const started = admitted.find((entry) => entry.type === 'started');
      expect(started?.args).toEqual(
        expect.arrayContaining(['--config', 'audit_marker="before"']),
      );
      expect(JSON.stringify(started?.args)).not.toContain(
        'audit_marker="after"',
      );
      expect(mutated).toEqual([]);
      expect(runtime.diagnostics.fingerprint).toBe(fingerprint);
      expect(runtime.metrics().activeOperations).toBe(0);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test('[L2:INTEGRATION] CWF2-AUD-001 rejects a conflicting real-child host without leaking or replacing admitted behavior', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-sdk-private-admission-'));
    const admittedTrace = join(root, 'admitted.jsonl');
    const conflictingTrace = join(root, 'conflicting.jsonl');
    await writeFile(admittedTrace, '');
    await writeFile(conflictingTrace, '');
    await chmod(executable, 0o755);
    let factoryCalls = 0;
    const factory: CodexAdapterFactory = (config) => {
      factoryCalls += 1;
      return createCodexSdkAdapter(config);
    };
    try {
      const runtime = initializeCodexHost(
        {
          codexPathOverride: executable,
          apiKey: 'admitted-api-secret',
          config: {
            audit_marker: 'admitted',
            nested: { array: ['admitted', { value: 'admitted' }] },
          },
          env: {
            CODEX_TEST_TRACE: admittedTrace,
            PATH: process.env.PATH ?? '/usr/bin:/bin',
            SECRET_VALUE: 'admitted-env-secret',
          },
        },
        factory,
      );

      expect(() =>
        initializeCodexHost(
          {
            codexPathOverride: executable,
            apiKey: 'conflicting-api-secret',
            config: {
              audit_marker: 'conflicting',
              nested: { array: ['conflicting', { value: 'conflicting' }] },
            },
            env: {
              CODEX_TEST_TRACE: conflictingTrace,
              PATH: process.env.PATH ?? '/usr/bin:/bin',
              DIFFERENT_SECRET_KEY: 'conflicting-env-secret',
            },
          },
          factory,
        ),
      ).toThrowError('CODEX_HOST_CONFLICT');
      expect(factoryCalls).toBe(1);

      await runtime.runTurn({ prompt: 'private admission remains original' });
      const admitted = await readTrace(admittedTrace);
      const conflicting = await readTrace(conflictingTrace);
      const started = admitted.find((entry) => entry.type === 'started');
      expect(started?.args).toEqual(
        expect.arrayContaining([
          '--config',
          'audit_marker="admitted"',
          '--config',
          'nested.array=["admitted", {value = "admitted"}]',
        ]),
      );
      expect(JSON.stringify(started)).not.toContain('conflicting');
      expect(conflicting).toEqual([]);
      expect(JSON.stringify(runtime.diagnostics)).not.toContain('secret');
      expect(runtime.metrics().activeOperations).toBe(0);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test('[L2:INTEGRATION] CDX-L2-001 spawns the controlled executable and forwards owned options and output schema', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-sdk-boundary-'));
    const trace = join(root, 'trace.jsonl');
    await writeFile(trace, '');
    await chmod(executable, 0o755);
    try {
      const runtime = host(trace);
      const actual = await runtime.runTurn({
        prompt: 'structured',
        model: 'gpt-5.1-codex',
        sandbox: 'read-only',
        approval: 'never',
        workingDirectory: root,
        skipGitRepoCheck: true,
        outputSchema: {
          type: 'object',
          properties: { accepted: { type: 'boolean' } },
          required: ['accepted'],
        },
      });

      expect(actual.threadId).toBe('controlled-thread');
      expect(actual.finalResponse).toBe('{"accepted":true}');
      expect(actual.usage).toEqual({
        inputTokens: 3,
        cachedInputTokens: 1,
        cacheWriteInputTokens: 0,
        outputTokens: 2,
        reasoningOutputTokens: 1,
      });
      const entries = await readTrace(trace);
      const started = entries.find((entry) => entry.type === 'started');
      expect(started?.input).toBe('structured');
      expect(started?.args).toEqual(
        expect.arrayContaining([
          'exec',
          '--experimental-json',
          '--model',
          'gpt-5.1-codex',
          '--sandbox',
          'read-only',
          '--cd',
          root,
          '--skip-git-repo-check',
        ]),
      );
      expect(started?.outputSchema).toEqual(
        expect.objectContaining({ required: ['accepted'] }),
      );
      expect(entries.some((entry) => entry.type === 'completed')).toBe(true);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test('[L2:INTEGRATION] CRA-RG-GC1-004 retains command identity for host policy while omitting command output', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-sdk-command-evidence-'));
    const trace = join(root, 'trace.jsonl');
    await writeFile(trace, '');
    await chmod(executable, 0o755);
    try {
      const runtime = host(trace);
      const actual = await runtime.runTurn({
        prompt: '__COMMAND_EVIDENCE__',
      });
      const command = actual.events.find(
        (event) =>
          event.type === 'item.completed' &&
          event.item?.type === 'command_execution',
      );
      expect(command?.item).toEqual({
        id: 'command-1',
        type: 'command_execution',
        command: '/bounded/private-command --secret value',
        exitCode: 0,
        status: 'completed',
      });
      expect(JSON.stringify(actual.events)).not.toContain(
        'private command output',
      );
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test.each([
    [
      'object',
      {
        type: 'object',
        additionalProperties: false,
        required: ['accepted'],
        properties: { accepted: { type: 'boolean' } },
      },
    ],
    ['array', { type: 'array', items: { type: 'string' } }],
    ['string', { type: 'string', minLength: 1 }],
  ])(
    '[L2:INTEGRATION] DF-GC1-006 forwards a supported %s schema through the real SDK child boundary',
    async (_name, outputSchema) => {
      const root = await mkdtemp(join(tmpdir(), 'codex-sdk-schema-matrix-'));
      const trace = join(root, 'trace.jsonl');
      await writeFile(trace, '');
      await chmod(executable, 0o755);
      try {
        const runtime = host(trace);
        await runtime.runTurn({
          prompt: `supported ${String(_name)} schema`,
          outputSchema,
        });
        const started = (await readTrace(trace)).find(
          (entry) => entry.type === 'started',
        );
        expect(started?.outputSchema).toEqual(outputSchema);
        expect(runtime.metrics().activeOperations).toBe(0);
      } finally {
        await rm(root, { force: true, recursive: true });
      }
    },
  );

  test('[L2:INTEGRATION] CDX-L2-001 binds a resumed thread identifier through the real SDK', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-sdk-resume-'));
    const trace = join(root, 'trace.jsonl');
    await writeFile(trace, '');
    await chmod(executable, 0o755);
    try {
      const runtime = host(trace);
      const actual = await runtime.runTurn({
        prompt: 'resume me',
        threadId: 'existing-thread',
      });
      expect(actual.threadId).toBe('existing-thread');
      const started = (await readTrace(trace)).find(
        (entry) => entry.type === 'started',
      );
      expect(started?.args).toEqual(
        expect.arrayContaining(['resume', 'existing-thread']),
      );
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test('[L2:INTEGRATION] CDX-L2-001 aborts and reaps a controlled child process', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-sdk-abort-'));
    const trace = join(root, 'trace.jsonl');
    await writeFile(trace, '');
    await chmod(executable, 0o755);
    try {
      const controller = new AbortController();
      const runtime = host(trace);
      const turn = runtime.runTurn({
        prompt: '__HANG__',
        signal: controller.signal,
      });
      const rejected = expect(turn).rejects.toThrow();
      const pid = await waitForStarted(trace);
      controller.abort();
      await rejected;
      for (let attempt = 0; attempt < 50 && processExists(pid); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(processExists(pid)).toBe(false);
      expect(runtime.metrics().activeOperations).toBe(0);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test('[L2:INTEGRATION] CDX-L2-001 fixture is a real executable owned by the test boundary', () => {
    const output = execFileSync(executable, ['--version-probe'], {
      encoding: 'utf8',
      input: 'probe',
      env: { ...process.env },
    });
    expect(output).toContain('"thread.started"');
    expect(output).toContain('echo:probe');
  });
});

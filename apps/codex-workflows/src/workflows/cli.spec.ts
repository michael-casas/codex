import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { resolve, join } from 'node:path';

import { describe, expect, test } from 'vitest';

// === L2: REAL-BOUNDARY INTEGRATION TESTS ===

const workspace = resolve(import.meta.dirname, '../../../..');
const executable = resolve(workspace, 'apps/codex-workflows/dist/main.js');
const workflowPath = resolve(
  workspace,
  'apps/codex-workflows/examples/canonical-review.workflow.json',
);
const inputPath = resolve(
  workspace,
  'apps/codex-workflows/examples/canonical-review.input.json',
);

function invoke(args: string[]) {
  return spawnSync(process.execPath, [executable, ...args], {
    cwd: workspace,
    encoding: 'utf8',
    env: { ...process.env },
  });
}

function digest(bytes: string | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function parseOutput(source: string): Record<string, unknown> {
  return JSON.parse(source) as Record<string, unknown>;
}

describe('[L2:E2E] built codex-workflows CLI', () => {
  test('[L2:E2E] CLI-L2-001 validates, inspects, plans, and dry-runs one definition with stable digests and zero mutation', async () => {
    const sourceBefore = await readFile(workflowPath);
    const inputBefore = await readFile(inputPath);
    const commands = [
      ['validate', workflowPath, '--input', inputPath, '--json'],
      ['inspect', workflowPath, '--json'],
      ['plan', workflowPath, '--input', inputPath, '--json'],
      ['dry-run', workflowPath, '--input', inputPath, '--json'],
    ];
    const results = commands.map(invoke);

    expect(results.map((result) => result.status)).toEqual([0, 0, 0, 0]);
    const payloads = results.map((result) => parseOutput(result.stdout));
    expect(payloads.every((payload) => payload.ok === true)).toBe(true);
    const definitionDigests = payloads.map(
      (payload) => payload.definitionDigest,
    );
    expect(new Set(definitionDigests).size).toBe(1);
    expect(definitionDigests[0]).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(payloads[2]?.nodes).toEqual(expect.any(Array));
    expect(payloads[3]).toEqual(
      expect.objectContaining({
        sideEffects: [],
        sdkInitialized: false,
        durableWrites: 0,
      }),
    );
    expect(digest(await readFile(workflowPath))).toBe(digest(sourceBefore));
    expect(digest(await readFile(inputPath))).toBe(digest(inputBefore));
  });

  test('[L2:E2E] CLI-L2-002 refuses durable work before any local or external mutation', async () => {
    await mkdir(resolve(workspace, 'tmp'), { recursive: true });
    const root = await mkdtemp(
      resolve(workspace, 'tmp/codex-workflows-durable-'),
    );
    const sentinel = join(root, 'sentinel.txt');
    await writeFile(sentinel, 'preserve-me');
    const piBefore = digest(
      await readFile(resolve(workspace, '.pi/goals/goal_events.jsonl')),
    );
    try {
      const before = await readdir(root);
      const result = invoke([
        'run',
        workflowPath,
        '--input',
        inputPath,
        '--json',
      ]);
      expect(result.status).toBe(69);
      expect(parseOutput(result.stderr)).toEqual(
        expect.objectContaining({
          ok: false,
          code: 'CONTROL_PLANE_UNAVAILABLE',
          exitCode: 69,
        }),
      );
      expect(await readdir(root)).toEqual(before);
      expect(await readFile(sentinel, 'utf8')).toBe('preserve-me');
      expect(
        digest(
          await readFile(resolve(workspace, '.pi/goals/goal_events.jsonl')),
        ),
      ).toBe(piBefore);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

// === L2: END-TO-END TESTS ===

describe('[L2:INTEGRATION] read-only legacy compatibility boundary', () => {
  test('[L2:INTEGRATION] CLI-L2-003 imports observed goal-v3 and event JSONL bytes idempotently without mutation', async () => {
    const paths = [
      resolve(
        workspace,
        '.pi/goals/archived/goal_2026071612024695_mrn48esr-mggbiz.md',
      ),
      resolve(workspace, '.pi/goals/goal_events.jsonl'),
    ];
    for (const path of paths) {
      const before = await readFile(path);
      const first = invoke(['import-pi', path, '--json']);
      const second = invoke(['import-pi', path, '--json']);
      expect(first.status).toBe(0);
      expect(second.status).toBe(0);
      expect(first.stdout).toBe(second.stdout);
      const payload = parseOutput(first.stdout);
      expect(payload.sourceDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(payload.historicalClaims).toEqual(expect.any(Array));
      expect(digest(await readFile(path))).toBe(digest(before));
    }
  });

  test('[L2:INTEGRATION] CLI-L2-003 rejects malformed and unsupported legacy records', async () => {
    await mkdir(resolve(workspace, 'tmp'), { recursive: true });
    const root = await mkdtemp(
      resolve(workspace, 'tmp/codex-workflows-legacy-'),
    );
    try {
      const malformed = join(root, 'malformed.jsonl');
      const unsupported = join(root, 'unsupported.md');
      await writeFile(malformed, '{not json}\n');
      await writeFile(unsupported, '{"version":2,"id":"old"}\n');
      for (const path of [malformed, unsupported]) {
        const result = invoke(['import-pi', path, '--json']);
        expect(result.status).toBe(65);
        expect(parseOutput(result.stderr)).toEqual(
          expect.objectContaining({ ok: false, exitCode: 65 }),
        );
      }
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

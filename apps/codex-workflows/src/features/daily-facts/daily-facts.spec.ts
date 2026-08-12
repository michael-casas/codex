import { spawnSync } from 'node:child_process';
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

const workspace = resolve(import.meta.dirname, '../../../../..');
const publicExecutable = resolve(
  workspace,
  'apps/codex-workflows/dist/main.js',
);
const canonicalWorkflow = resolve(
  workspace,
  'apps/codex-workflows/examples/daily-facts.workflow.ts',
);
const canonicalContract = resolve(
  workspace,
  'apps/codex-workflows/src/features/daily-facts/support/contract.ts',
);
const controlledCodex = fileURLToPath(
  new URL('./support/controlled-codex.mjs', import.meta.url),
);

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function trace(path: string): Promise<Record<string, unknown>[]> {
  const bytes = await readFile(path, 'utf8');
  return bytes
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

// === L2: END-TO-END TESTS ===
describe('[L2:E2E] Founder daily-facts public workflow', () => {
  test('[L2:E2E] DF-GC1-011 runs exactly three concurrent Luna medium researchers and publishes the exact validated report', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-daily-facts-e2e-'));
    try {
      const bin = join(root, 'bin');
      const state = join(root, 'state');
      const source = join(
        root,
        'apps/codex-workflows/examples/daily-facts.workflow.ts',
      );
      const contract = join(
        root,
        'apps/codex-workflows/src/features/daily-facts/support/contract.ts',
      );
      const input = join(root, 'daily-facts.input.json');
      const tracePath = join(root, 'controlled-codex.jsonl');
      await mkdir(bin);
      await mkdir(dirname(source), { recursive: true });
      await mkdir(dirname(contract), { recursive: true });
      await cp(canonicalWorkflow, source);
      await cp(canonicalContract, contract);
      await writeFile(
        input,
        `${JSON.stringify({
          utcTimestamp: '20260810T170000Z',
          selectionSeed: 'controlled-20260810',
        })}\n`,
      );
      await writeFile(tracePath, '');
      await chmod(publicExecutable, 0o755);
      await chmod(controlledCodex, 0o755);
      await chmod(source, 0o755);
      await symlink(publicExecutable, join(bin, 'codex-workflows'));

      const result = spawnSync(source, ['--input', input, '--json'], {
        cwd: root,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH ?? '/usr/bin:/bin'}`,
          CODEX_WORKFLOWS_CODEX_PATH: controlledCodex,
          CODEX_WORKFLOWS_HOME: state,
          CODEX_DAILY_FACTS_TEST_TRACE: tracePath,
          CODEX_DAILY_FACTS_ALLOW_CONTROLLED_SOURCES: '1',
        },
      });
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        journalPath: string;
        nodeCount: number;
        artifactCount: number;
        output: { report: { publishedPath: string; digest: string } };
      };
      expect(payload).toEqual(
        expect.objectContaining({ nodeCount: 3, artifactCount: 1 }),
      );

      const entries = await trace(tracePath);
      const started = entries.filter((entry) => entry.type === 'started');
      const completed = entries.filter((entry) => entry.type === 'completed');
      expect(started).toHaveLength(3);
      expect(completed).toHaveLength(3);
      for (const entry of started) {
        expect(entry.args).toEqual(
          expect.arrayContaining([
            '--model',
            'gpt-5.6-luna',
            '--config',
            'model_reasoning_effort="medium"',
          ]),
        );
      }
      expect(new Set(started.map((entry) => entry.slot))).toEqual(
        new Set([1, 2, 3]),
      );
      expect(
        Math.max(...started.map((entry) => Number(entry.atMs))),
      ).toBeLessThan(Math.min(...completed.map((entry) => Number(entry.atMs))));

      const reportPath = join(
        root,
        '.agent/testing/workflows/20260810T170000Z/DAILY_FACTS.md',
      );
      expect(await realpath(payload.output.report.publishedPath)).toBe(
        await realpath(reportPath),
      );
      const report = await readFile(reportPath, 'utf8');
      expect(report.match(/^## What's going on with .+ in .+$/gm)).toHaveLength(
        3,
      );
      expect(report.match(/\[[^\]]+\]\(https:\/\/[^)]+\)/g)).toHaveLength(6);

      const journalBytes = await readFile(payload.journalPath, 'utf8');
      const journal = JSON.parse(journalBytes) as {
        status: string;
        nodes: unknown[];
        events: Array<{ type?: string }>;
        artifacts: Array<{ digest?: string; publishedPath?: string }>;
      };
      expect(journal.status).toBe('completed');
      expect(journal.nodes).toHaveLength(3);
      expect(journal.events.at(-1)?.type).toBe('workflow.completed');
      expect(journal.artifacts).toHaveLength(1);
      expect(journal.artifacts[0]).toEqual(
        expect.objectContaining({ digest: payload.output.report.digest }),
      );
      expect(await realpath(journal.artifacts[0]?.publishedPath ?? '')).toBe(
        await realpath(reportPath),
      );
      expect(
        entries
          .map((entry) => entry.pid)
          .filter((pid): pid is number => typeof pid === 'number')
          .every((pid) => !processExists(pid)),
      ).toBe(true);
      expect(
        (await readdir(root, { recursive: true })).some((name) =>
          String(name).endsWith('.tmp'),
        ),
      ).toBe(false);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

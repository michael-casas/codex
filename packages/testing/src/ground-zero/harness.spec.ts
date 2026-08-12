import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import { afterEach, describe, expect, it } from 'vitest';

const cli = resolve('packages/testing/src/cli.ts');
const temporaryRoots = new Set<string>();
const repairEvidence = resolve(
  'packages/testing/evidence/codex-workflows-repair-attempt-1-reproof.json',
);

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value !== 'object' || value === null) return JSON.stringify(value);
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(',')}}`;
}

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'orchestration-ground-zero-'));
  temporaryRoots.add(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    [...temporaryRoots].map((root) =>
      rm(root, { force: true, recursive: true }),
    ),
  );
  temporaryRoots.clear();
});

// === L2: REAL-BOUNDARY INTEGRATION TESTS ===
describe('[L2:INTEGRATION] Ground-0 process and filesystem boundaries', () => {
  it('[L2:INTEGRATION] CWF-AUD-004 requires content-addressed recovery re-proof without claiming historical RED', async () => {
    expect(existsSync(repairEvidence)).toBe(true);
    const artifact = JSON.parse(await readFile(repairEvidence, 'utf8')) as {
      artifactDigest: string;
      artifactType: string;
      authority: { historicalRedClaimed: boolean };
      candidate: { preRepairAggregateDigest: string };
      checks: Array<{
        cleanup: { processDelta: number; temporaryPathDelta: number };
        executed: number;
        exitCode: number;
        findingId: string;
        selected: number;
      }>;
      frozenContract: { digest: string; id: string };
      limitation: string;
      schemaVersion: number;
    };
    const { artifactDigest, ...payload } = artifact;
    const computed = `sha256:${createHash('sha256')
      .update(canonical(payload))
      .digest('hex')}`;

    expect(artifact).toMatchObject({
      artifactType: 'codex-workflows-recovery-reproof',
      authority: { historicalRedClaimed: false },
      candidate: {
        preRepairAggregateDigest:
          'e2d7cba72fb07323850a15e8c47f33873b2aa038400c00018e1a1fb736d2022d',
      },
      limitation: 'recovery-evidence-not-historical-red-proof',
      schemaVersion: 1,
    });
    expect(artifact.frozenContract.id).toBe('CDX-WF-AUD1-REPAIR-GC1');
    expect(artifact.frozenContract.digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(artifactDigest).toBe(computed);
    expect(artifact.checks.map((check) => check.findingId).sort()).toEqual([
      'CWF-AUD-001',
      'CWF-AUD-002',
      'CWF-AUD-003',
      'CWF-AUD-004',
      'CWF-AUD-005',
      'CWF-AUD-006',
    ]);
    expect(
      artifact.checks.every(
        (check) =>
          check.selected > 0 &&
          check.executed > 0 &&
          Number.isInteger(check.exitCode) &&
          check.cleanup.processDelta === 0 &&
          check.cleanup.temporaryPathDelta === 0,
      ),
    ).toBe(true);
  });

  it('propagates a nonzero child exit and records failed evidence', async () => {
    const root = await temporaryRoot();
    const manifest = join(root, 'manifest.json');
    const result = join(root, 'result.json');
    await writeFile(
      manifest,
      JSON.stringify({
        project: 'fixture',
        result,
        suites: [
          {
            layer: 'l1-unit',
            heading: '--- Unit Tests [L1:UNIT] ---',
            command: [process.execPath, '-e', 'process.exit(9)'],
            expected: 1,
          },
        ],
      }),
    );
    const run = spawnSync('bun', [cli, 'aggregate', manifest], {
      encoding: 'utf8',
    });
    expect(run.status).toBe(9);
    expect(JSON.parse(await readFile(result, 'utf8'))).toMatchObject({
      status: 'failed',
      children: [{ exitCode: 9, selected: 1, status: 'failed' }],
    });
  });

  it('rejects an empty collector even when its child exits zero', async () => {
    const root = await temporaryRoot();
    const manifest = join(root, 'manifest.json');
    await writeFile(
      manifest,
      JSON.stringify({
        project: 'fixture',
        result: join(root, 'result.json'),
        suites: [
          {
            layer: 'l1-unit',
            heading: '--- Unit Tests [L1:UNIT] ---',
            command: [
              process.execPath,
              '-e',
              'process.stdout.write(JSON.stringify({selected:0}))',
            ],
            expected: 'from-output',
          },
        ],
      }),
    );
    const run = spawnSync('bun', [cli, 'aggregate', manifest], {
      encoding: 'utf8',
    });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain('selected zero tests');
  });

  it('[L2:INTEGRATION] CWF2-AUD-003 preserves actual zero selection in failed aggregate evidence', async () => {
    const root = await temporaryRoot();
    const manifest = join(root, 'manifest.json');
    const result = join(root, 'result.json');
    await writeFile(
      manifest,
      JSON.stringify({
        project: 'fixture',
        result,
        suites: [
          {
            layer: 'l1-unit',
            heading: '--- Unit Tests [L1:UNIT] ---',
            command: [
              process.execPath,
              '-e',
              "process.stdout.write('Tests 0 passed')",
            ],
            expected: 'vitest-output',
          },
        ],
      }),
    );

    const run = spawnSync('bun', [cli, 'aggregate', manifest], {
      encoding: 'utf8',
    });
    expect(run.status).toBe(1);
    expect(JSON.parse(await readFile(result, 'utf8'))).toMatchObject({
      status: 'failed',
      children: [
        {
          executed: 0,
          exitCode: 1,
          selected: 0,
          status: 'failed',
        },
      ],
    });
  });

  it('[L2:INTEGRATION] CWF2-AUD-003 preserves malformed collector counts without inventing execution', async () => {
    const root = await temporaryRoot();
    const manifest = join(root, 'manifest.json');
    const result = join(root, 'result.json');
    await writeFile(
      manifest,
      JSON.stringify({
        project: 'fixture',
        result,
        suites: [
          {
            layer: 'l2-integration',
            heading: '--- Real-Boundary Integration Tests [L2:INTEGRATION] ---',
            command: [
              process.execPath,
              '-e',
              "process.stdout.write('malformed collector output')",
            ],
            expected: 'vitest-output',
          },
        ],
      }),
    );

    const run = spawnSync('bun', [cli, 'aggregate', manifest], {
      encoding: 'utf8',
    });
    expect(run.status).toBe(1);
    expect(JSON.parse(await readFile(result, 'utf8'))).toMatchObject({
      status: 'failed',
      children: [
        {
          executed: null,
          exitCode: 1,
          selected: 0,
          status: 'failed',
        },
      ],
    });
  });

  it('[L2:INTEGRATION] CWF2-AUD-003 preserves valid nonzero selected and executed counts', async () => {
    const root = await temporaryRoot();
    const manifest = join(root, 'manifest.json');
    const result = join(root, 'result.json');
    await writeFile(
      manifest,
      JSON.stringify({
        project: 'fixture',
        result,
        suites: [
          {
            layer: 'l1-unit',
            heading: '--- Unit Tests [L1:UNIT] ---',
            command: [
              process.execPath,
              '-e',
              "process.stdout.write('Tests 3 passed')",
            ],
            expected: 'vitest-output',
          },
        ],
      }),
    );

    const run = spawnSync('bun', [cli, 'aggregate', manifest], {
      encoding: 'utf8',
    });
    expect(run.status).toBe(0);
    expect(JSON.parse(await readFile(result, 'utf8'))).toMatchObject({
      status: 'passed',
      children: [
        {
          executed: 3,
          exitCode: 0,
          selected: 3,
          status: 'passed',
        },
      ],
    });
  });

  it.each(['success', 'failure'] as const)(
    'cleans temporary execution state after %s',
    async (mode) => {
      const root = await temporaryRoot();
      const work = join(root, 'work');
      const manifest = join(root, 'manifest.json');
      await writeFile(
        manifest,
        JSON.stringify({
          project: 'fixture',
          result: join(root, 'result.json'),
          temporaryDirectory: work,
          suites: [
            {
              layer: 'l2-integration',
              heading:
                '--- Real-Boundary Integration Tests [L2:INTEGRATION] ---',
              command: [
                process.execPath,
                '-e',
                `process.exit(${mode === 'success' ? 0 : 3})`,
              ],
              expected: 1,
            },
          ],
        }),
      );
      spawnSync('bun', [cli, 'aggregate', manifest], { encoding: 'utf8' });
      expect(await readdir(root)).not.toContain('work');
    },
  );

  it.each([
    ['undefined', '', 'an undefined step'],
    [
      'ambiguous',
      "Given('an adversarial binding', function () {})\nGiven('an adversarial binding', function () {})",
      'an ambiguous step',
    ],
    [
      'pending',
      "Given('an adversarial binding', function () { return 'pending' })",
      'a pending scenario',
    ],
    [
      'skipped',
      "Given('an adversarial binding', function () { return 'skipped' })",
      'a skipped scenario',
    ],
    [
      'assertion-free',
      "Then('an adversarial binding', function () { return this.result })",
      'an assertion-free binding',
    ],
  ] as const)(
    'rejects Cucumber %s evidence',
    async (kind, binding, expectedMessage) => {
      const root = await temporaryRoot();
      const keyword = kind === 'assertion-free' ? 'Then' : 'Given';
      await writeFile(
        join(root, 'adversarial.feature'),
        `Feature: Adversarial binding\n  Scenario: Reject invalid evidence\n    ${keyword} an adversarial binding\n`,
      );
      await writeFile(
        join(root, 'adversarial.steps.ts'),
        `import { Given, Then } from '@cucumber/cucumber'\n${binding}\n`,
      );
      const run = spawnSync(
        'bun',
        [
          cli,
          'verify-cucumber',
          join(root, 'adversarial.feature'),
          join(root, 'adversarial.steps.ts'),
        ],
        { encoding: 'utf8' },
      );
      expect(run.status).not.toBe(0);
      expect(run.stderr).toContain(expectedMessage);
    },
  );

  it.each([
    [
      'source',
      'apps/daemon/src/main.ts',
      ['@orchestration/daemon', '@orchestration/daemon-e2e'],
    ],
    [
      'test',
      'packages/testing/src/ground-zero/harness.test.ts',
      ['@orchestration/testing'],
    ],
    [
      'feature',
      'packages/testing/src/ground-zero/ground-zero.feature',
      ['@orchestration/testing'],
    ],
    [
      'step',
      'packages/testing/src/ground-zero/index.steps.ts',
      ['@orchestration/testing'],
    ],
    [
      'shared configuration',
      'cucumber.mjs',
      [
        '@orchestration/daemon',
        '@orchestration/daemon-e2e',
        '@orchestration/process',
        '@orchestration/testing',
        'codex',
        'codex-monitor',
        'codex-workflows',
        'workflows',
      ],
    ],
    [
      'lockfile',
      'bun.lock',
      [
        '@orchestration/daemon',
        '@orchestration/daemon-e2e',
        '@orchestration/process',
        '@orchestration/testing',
        'codex',
        'codex-monitor',
        'codex-workflows',
        'workflows',
      ],
    ],
    [
      'Docker',
      'apps/daemon/Dockerfile',
      ['@orchestration/daemon', '@orchestration/daemon-e2e'],
    ],
    [
      'bootstrap SQL',
      'db/bootstrap/roles.sql',
      [
        '@orchestration/daemon',
        '@orchestration/daemon-e2e',
        '@orchestration/process',
        '@orchestration/testing',
        'codex',
        'codex-monitor',
        'codex-workflows',
        'workflows',
      ],
    ],
    [
      'migration',
      'db/migrations/001_process.sql',
      [
        '@orchestration/daemon',
        '@orchestration/daemon-e2e',
        '@orchestration/process',
        '@orchestration/testing',
        'codex',
        'codex-monitor',
        'codex-workflows',
        'workflows',
      ],
    ],
    [
      'protocol schema',
      'schemas/events/process.schema.json',
      [
        '@orchestration/daemon',
        '@orchestration/daemon-e2e',
        '@orchestration/process',
        '@orchestration/testing',
        'codex',
        'codex-monitor',
        'codex-workflows',
        'workflows',
      ],
    ],
  ] as const)(
    '[L2:INTEGRATION] DF-GC1-009 keeps the exact expected affected closure and produces no Git-visible Python bytecode for %s changes',
    (_kind, file, expected) => {
      if (_kind === 'shared configuration') {
        const visibleBytecode = spawnSync(
          'git',
          [
            'ls-files',
            '--others',
            '--exclude-standard',
            '--',
            'apps/codex-monitor',
          ],
          { cwd: resolve('.'), encoding: 'utf8' },
        );
        expect(visibleBytecode.status).toBe(0);
        expect(
          visibleBytecode.stdout
            .trim()
            .split('\n')
            .filter((path) => /(?:^|\/)__pycache__\/|\.pyc$/.test(path)),
        ).toEqual([]);
      }
      const run = spawnSync(
        'bun',
        ['nx', 'show', 'projects', '--affected', '--files', file, '--json'],
        { cwd: resolve('.'), encoding: 'utf8' },
      );
      expect(run.status).toBe(0);
      expect((JSON.parse(run.stdout) as string[]).sort()).toEqual(
        [...expected].sort(),
      );
    },
  );

  it('declares live L2 and L3 targets uncached independently of affected selection', () => {
    const run = spawnSync(
      'bun',
      ['nx', 'show', 'project', '@orchestration/testing', '--json'],
      {
        cwd: resolve('.'),
        encoding: 'utf8',
      },
    );
    expect(run.status).toBe(0);
    const project = JSON.parse(run.stdout) as {
      targets: Record<string, { cache?: boolean }>;
    };
    expect(project.targets['test-l2']?.cache).toBe(false);
    expect(project.targets['test-l3']?.cache).toBe(false);
  });
});

// === L2: END-TO-END TESTS ===
describe('[L2:E2E] Ground-0 public harness workflow', () => {
  it('emits the complete human suite order and valid machine evidence', async () => {
    const root = await temporaryRoot();
    const result = join(root, 'result.json');
    const manifest = join(root, 'manifest.json');
    const headings = [
      '=== Layer 1 Test Suite ===',
      '--- Unit Tests [L1:UNIT] ---',
      '--- In-Process Integration Tests [L1:INTEGRATION] ---',
      '=== Layer 2 Test Suite ===',
      '--- Real-Boundary Integration Tests [L2:INTEGRATION] ---',
      '--- End-to-End Tests [L2:E2E] ---',
      '=== Layer 3 Test Suite ===',
      '--- Cucumber Behavioral Tests ---',
    ];
    await writeFile(
      manifest,
      JSON.stringify({
        project: 'fixture',
        result,
        suites: headings.map((heading, index) => ({
          layer: index < 3 ? 'l1-unit' : index < 6 ? 'l2-integration' : 'l3',
          heading,
          command: [process.execPath, '-e', 'process.exit(0)'],
          expected: 1,
        })),
      }),
    );
    const run = spawnSync('bun', [cli, 'aggregate', manifest], {
      encoding: 'utf8',
    });
    expect(run.status).toBe(0);
    let cursor = -1;
    for (const heading of headings) {
      const next = run.stdout.indexOf(heading);
      expect(next).toBeGreaterThan(cursor);
      cursor = next;
    }
    expect(JSON.parse(await readFile(result, 'utf8'))).toMatchObject({
      schemaVersion: 1,
      project: 'fixture',
      status: 'passed',
    });
  });

  it('rejects malformed child machine output instead of reporting success', async () => {
    const root = await temporaryRoot();
    const manifest = join(root, 'manifest.json');
    await writeFile(
      manifest,
      JSON.stringify({
        project: 'fixture',
        result: join(root, 'result.json'),
        suites: [
          {
            layer: 'l2-e2e',
            heading: '--- End-to-End Tests [L2:E2E] ---',
            command: [
              process.execPath,
              '-e',
              "process.stdout.write('{bad json')",
            ],
            expected: 'from-output',
          },
        ],
      }),
    );
    const run = spawnSync('bun', [cli, 'aggregate', manifest], {
      encoding: 'utf8',
    });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain('malformed machine result');
  });
});

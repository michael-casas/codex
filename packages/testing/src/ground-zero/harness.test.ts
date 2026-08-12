import { describe, expect, it } from 'vitest';

import {
  analyzeStandingTargetConfig,
  analyzeTestSource,
  classifyTestFile,
  createAffectedInvocation,
  normalizeGitNameStatus,
  validateAggregateResult,
} from '../lib/testing.js';

// === L1: UNIT TESTS ===
describe('[L1:UNIT] Ground-0 layer ownership and policy', () => {
  it('[L1:UNIT] CWF-AUD-003 rejects zero-selection standing-target globs and omitted layer files', () => {
    const invalidGlob = analyzeStandingTargetConfig(
      'packages/codex/project.json',
      JSON.stringify({
        targets: {
          'test-l1': {
            executor: 'nx:run-commands',
            options: {
              command:
                'vitest run --config packages/codex/vitest.config.ts src/**/*.test.ts',
            },
          },
        },
      }),
      [
        'packages/codex/src/runtime/one.test.ts',
        'packages/codex/src/runtime/two.test.ts',
      ],
      () => undefined,
    );
    const omitted = analyzeStandingTargetConfig(
      'packages/codex/project.json',
      JSON.stringify({
        targets: {
          'test-l1': {
            executor: 'nx:run-commands',
            options: {
              command:
                'vitest run --config packages/codex/vitest.config.ts src/runtime/one.test.ts',
            },
          },
        },
      }),
      [
        'packages/codex/src/runtime/one.test.ts',
        'packages/codex/src/runtime/two.test.ts',
      ],
      () => undefined,
    );

    expect(invalidGlob.violations).toContainEqual(
      expect.objectContaining({ code: 'INVALID_STANDING_TARGET_FILTER' }),
    );
    expect(omitted.violations).toContainEqual(
      expect.objectContaining({ code: 'STANDING_TARGET_FILE_OMISSION' }),
    );
  });

  it('[L1:UNIT] CWF2-AUD-002 proves exact exhaustive standing-target selection and rejects false-green policy', () => {
    const projectPath = 'packages/fixture/project.json';
    const files = [
      'packages/fixture/src/one.test.ts',
      'packages/fixture/src/two.test.ts',
      'packages/fixture/src/one.spec.ts',
    ];
    const inspect = (
      targets: Record<string, unknown>,
      config = 'export default { test: { passWithNoTests: false } }',
    ) =>
      analyzeStandingTargetConfig(
        projectPath,
        JSON.stringify({ targets }),
        files,
        () => config,
      );
    const exactTargets = {
      'test-l1': {
        executor: 'nx:run-commands',
        options: {
          command:
            'vitest run --config packages/fixture/vitest.config.ts src/one.test.ts src/two.test.ts',
        },
      },
      'test-l2': {
        cache: false,
        executor: 'nx:run-commands',
        options: {
          command:
            'vitest run --config packages/fixture/vitest.config.ts src/one.spec.ts',
        },
      },
    };

    expect(inspect(exactTargets).violations).toEqual([]);

    const cases: Array<{
      code: string;
      config?: string;
      targets: Record<string, unknown>;
    }> = [
      {
        code: 'INVALID_STANDING_TARGET_FILTER',
        targets: {
          ...exactTargets,
          'test-l1': {
            executor: 'nx:run-commands',
            options: {
              command:
                'vitest run --config packages/fixture/vitest.config.ts src/**/*.test.ts',
            },
          },
        },
      },
      {
        code: 'STANDING_TARGET_FILE_OMISSION',
        targets: {
          ...exactTargets,
          'test-l1': {
            executor: 'nx:run-commands',
            options: {
              command:
                'vitest run --config packages/fixture/vitest.config.ts src/one.test.ts',
            },
          },
        },
      },
      {
        code: 'STANDING_TARGET_FILE_OMISSION',
        config:
          "export default { test: { include: ['src/**/*.test.ts'], exclude: ['src/two.test.ts'], passWithNoTests: false } }",
        targets: {
          ...exactTargets,
          'test-l1': {
            executor: 'nx:run-commands',
            options: {
              command:
                'vitest run --config packages/fixture/vitest.config.ts src/one.test.ts src/two.test.ts',
            },
          },
        },
      },
      {
        code: 'INVALID_STANDING_TARGET_RUNNER',
        targets: {
          ...exactTargets,
          'test-l1': {
            executor: '@nx/vite:test',
            options: { command: 'vitest run src/one.test.ts src/two.test.ts' },
          },
        },
      },
      {
        code: 'INVALID_STANDING_TARGET_RUNNER',
        targets: {
          ...exactTargets,
          'test-l1': {
            executor: 'nx:run-commands',
            options: {
              command: 'echo vitest run src/one.test.ts src/two.test.ts',
            },
          },
        },
      },
      {
        code: 'MISSING_STANDING_TARGET',
        targets: { 'test-l2': exactTargets['test-l2'] },
      },
      {
        code: 'STANDING_TARGET_SELECTION_UNPROVEN',
        config:
          "export default { test: { include: ['src/does-not-exist/**/*.test.ts'] } }",
        targets: {
          ...exactTargets,
          'test-l1': {
            executor: 'nx:run-commands',
            options: {
              command: 'vitest run --config packages/fixture/vitest.config.ts',
            },
          },
        },
      },
      {
        code: 'STANDING_TARGET_SELECTION_UNPROVEN',
        config:
          "import shared from './shared.js'; export default { test: { include: ['src/**/*.test.ts'], ...shared } }",
        targets: exactTargets,
      },
      {
        code: 'STANDING_TARGET_SELECTION_UNPROVEN',
        config:
          'const decoy = "include: [\'src/**/*.test.ts\']"; export default { test: { passWithNoTests: false } }',
        targets: {
          ...exactTargets,
          'test-l1': {
            executor: 'nx:run-commands',
            options: {
              command: 'vitest run --config packages/fixture/vitest.config.ts',
            },
          },
        },
      },
      {
        code: 'STANDING_TARGET_CROSS_LAYER_SELECTION',
        config:
          "export default { test: { include: ['src/**/*.test.ts', 'src/**/*.spec.ts'] } }",
        targets: {
          ...exactTargets,
          'test-l1': {
            executor: 'nx:run-commands',
            options: {
              command:
                'vitest run --config packages/fixture/vitest.config.ts src/one.test.ts src/two.test.ts src/one.spec.ts',
            },
          },
        },
      },
      {
        code: 'PASS_WITH_NO_TESTS_ENABLED',
        targets: {
          ...exactTargets,
          'test-l1': {
            executor: 'nx:run-commands',
            options: {
              command:
                'vitest run --config packages/fixture/vitest.config.ts src/one.test.ts src/two.test.ts --passWithNoTests',
            },
          },
        },
      },
      {
        code: 'PASS_WITH_NO_TESTS_ENABLED',
        config: 'export default { test: { passWithNoTests: true } }',
        targets: exactTargets,
      },
      {
        code: 'LIVE_TARGET_CACHE_ENABLED',
        targets: {
          ...exactTargets,
          'test-l2': {
            ...exactTargets['test-l2'],
            cache: true,
          },
        },
      },
    ];

    for (const fixture of cases) {
      expect(
        inspect(fixture.targets, fixture.config).violations,
        fixture.code,
      ).toContainEqual(expect.objectContaining({ code: fixture.code }));
    }
  });

  it.each([
    ['src/math.test.ts', "describe('[L1:UNIT] math', () => {})", 'l1-unit'],
    [
      'src/store.test.ts',
      "describe('[L1:INTEGRATION] store', () => {})",
      'l1-integration',
    ],
    [
      'src/process.spec.ts',
      "describe('[L2:INTEGRATION] process', () => {})",
      'l2-integration',
    ],
    ['src/cli.spec.ts', "describe('[L2:E2E] cli', () => {})", 'l2-e2e'],
    ['src/ground-zero.feature', 'Feature: Ground-0', 'l3'],
  ] as const)('classifies %s at its owned layer', (path, source, expected) => {
    expect(classifyTestFile(path, source)).toBe(expected);
  });

  it('recognizes both L1 markers only in unit-before-integration order', () => {
    const source = [
      '// === L1: IN-PROCESS INTEGRATION TESTS ===',
      "describe('[L1:INTEGRATION] later', () => {})",
      '// === L1: UNIT TESTS ===',
      "describe('[L1:UNIT] earlier', () => {})",
    ].join('\n');
    expect(analyzeTestSource('reversed.test.ts', source)).toContainEqual(
      expect.objectContaining({ code: 'L1_MARKER_ORDER' }),
    );
  });

  it('recognizes both L2 markers only in integration-before-e2e order', () => {
    const source = [
      '// === L2: END-TO-END TESTS ===',
      "describe('[L2:E2E] later', () => {})",
      '// === L2: REAL-BOUNDARY INTEGRATION TESTS ===',
      "describe('[L2:INTEGRATION] earlier', () => {})",
    ].join('\n');
    expect(analyzeTestSource('reversed.spec.ts', source)).toContainEqual(
      expect.objectContaining({ code: 'L2_MARKER_ORDER' }),
    );
  });

  it.each([
    [
      'steps importing L1',
      'src/index.steps.ts',
      "import './thing.test.ts'",
      'CROSS_LAYER_IMPORT',
    ],
    [
      'steps importing L2',
      'src/index.steps.ts',
      "import './thing.spec.ts'",
      'CROSS_LAYER_IMPORT',
    ],
    [
      'L2 importing L1',
      'src/thing.spec.ts',
      "import './thing.test.ts'",
      'CROSS_LAYER_IMPORT',
    ],
    [
      'steps spawning L1',
      'src/index.steps.ts',
      "spawnSync('bun', ['nx', 'test-l1', 'project'])",
      'CUCUMBER_RUNNER_OF_RUNNERS',
    ],
    [
      'steps spawning L2',
      'src/index.steps.ts',
      "execFileSync('bun', ['nx', 'test-l2', 'project'])",
      'CUCUMBER_RUNNER_OF_RUNNERS',
    ],
    [
      'no-op assertion',
      'src/index.steps.ts',
      "Then('done', () => { expect(true).toBe(true) })",
      'NO_OP_ASSERTION',
    ],
    [
      'assertion-free Then',
      'src/index.steps.ts',
      "Then('done', () => { return world.result })",
      'ASSERTION_FREE_THEN',
    ],
    [
      'mechanically unawaited async assertion',
      'src/index.steps.ts',
      "Then('done', async () => { expect.poll(readResult).toBe('ok') })",
      'UNAWAITED_ASYNC_ASSERTION',
    ],
  ] as const)('rejects %s', (_case, path, source, code) => {
    expect(analyzeTestSource(path, source)).toContainEqual(
      expect.objectContaining({ code }),
    );
  });

  it('accepts explicit web and mobile N/A declarations', () => {
    const source = JSON.stringify({
      surfaces: {
        web: { status: 'not-applicable' },
        mobile: { status: 'not-applicable' },
      },
    });
    expect(analyzeTestSource('testing.profile.json', source)).toEqual([]);
  });

  it('rejects a required collector selecting zero tests', () => {
    expect(
      validateAggregateResult({
        schemaVersion: 1,
        project: '@orchestration/testing',
        status: 'passed',
        startedAt: '2026-07-15T12:00:00.000Z',
        durationMs: 1,
        children: [
          {
            artifact: 'unit.json',
            command: 'vitest run',
            durationMs: 1,
            exitCode: 0,
            layer: 'l1-unit',
            selected: 0,
            status: 'passed',
          },
        ],
      }),
    ).toBe(false);
  });

  it('accepts exact nonzero selections and explicit N/A without inventing tests', () => {
    expect(
      validateAggregateResult({
        schemaVersion: 1,
        project: '@orchestration/testing',
        status: 'passed',
        startedAt: '2026-07-15T12:00:00.000Z',
        durationMs: 8,
        children: [
          {
            artifact: 'unit.json',
            command: 'vitest run',
            durationMs: 5,
            exitCode: 0,
            layer: 'l1-unit',
            selected: 3,
            status: 'passed',
          },
          {
            artifact: 'web-na.json',
            command: 'N/A: no web surface',
            durationMs: 0,
            exitCode: 0,
            layer: 'l2-e2e',
            selected: 0,
            status: 'not-applicable',
          },
        ],
      }),
    ).toBe(true);
  });

  it('[L1:UNIT] CWF2-AUD-003 accepts honest failed-zero evidence without treating it as a pass', () => {
    const failedZero = {
      schemaVersion: 1,
      project: '@orchestration/testing',
      status: 'failed',
      startedAt: '2026-08-08T12:00:00.000Z',
      durationMs: 5,
      children: [
        {
          artifact: 'unit.json',
          command: 'vitest run',
          durationMs: 5,
          executed: 0,
          exitCode: 1,
          layer: 'l1-unit',
          selected: 0,
          status: 'failed',
        },
      ],
    };

    expect(validateAggregateResult(failedZero)).toBe(true);
    expect(
      validateAggregateResult({
        ...failedZero,
        status: 'passed',
        children: [
          {
            ...failedZero.children[0],
            exitCode: 0,
            status: 'passed',
          },
        ],
      }),
    ).toBe(false);
    expect(failedZero.children[0]?.selected).toBe(0);
    expect(failedZero.children[0]?.executed).toBe(0);
  });
});

// === L1: IN-PROCESS INTEGRATION TESTS ===
describe('[L1:INTEGRATION] Ground-0 staged affected boundary', () => {
  it('normalizes additions, modifications, deletions, and both sides of renames', () => {
    const status = [
      'A\0packages/testing/src/new.ts\0',
      'M\0apps/daemon/src/main.ts\0',
      'D\0packages/testing/src/deleted.ts\0',
      'R100\0packages/testing/src/old.ts\0packages/testing/src/renamed.ts\0',
    ].join('');
    expect(normalizeGitNameStatus(status)).toEqual([
      'apps/daemon/src/main.ts',
      'packages/testing/src/deleted.ts',
      'packages/testing/src/new.ts',
      'packages/testing/src/old.ts',
      'packages/testing/src/renamed.ts',
    ]);
  });

  it('creates one Nx affected invocation for one normalized file set', () => {
    expect(
      createAffectedInvocation(
        ['packages/testing/src/a.ts', 'apps/daemon/src/main.ts'],
        ['lint', 'test-l1', 'typecheck'],
      ),
    ).toEqual([
      'bun',
      'nx',
      'affected',
      '-t',
      'lint,test-l1,typecheck',
      '--files',
      'apps/daemon/src/main.ts,packages/testing/src/a.ts',
      '--outputStyle=static',
    ]);
  });

  it('rejects malformed machine output and false child success', () => {
    expect(
      validateAggregateResult({ status: 'passed', children: 'malformed' }),
    ).toBe(false);
    expect(
      validateAggregateResult({
        schemaVersion: 1,
        project: '@orchestration/testing',
        status: 'passed',
        startedAt: '2026-07-15T12:00:00.000Z',
        durationMs: 5,
        children: [
          {
            artifact: 'child.json',
            command: 'false',
            durationMs: 5,
            exitCode: 9,
            layer: 'l2-e2e',
            selected: 1,
            status: 'failed',
          },
        ],
      }),
    ).toBe(false);
  });
});

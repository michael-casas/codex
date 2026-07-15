import { describe, expect, it } from 'vitest';

import {
  analyzeTestSource,
  classifyTestFile,
  createAffectedInvocation,
  normalizeGitNameStatus,
  validateAggregateResult,
} from '../lib/testing.js';

// === L1: UNIT TESTS ===
describe('[L1:UNIT] Ground-0 layer ownership and policy', () => {
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
        ['lint', 'test', 'typecheck'],
      ),
    ).toEqual([
      'bun',
      'nx',
      'affected',
      '-t',
      'lint,test,typecheck',
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

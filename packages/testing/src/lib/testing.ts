export type TestLayer =
  | 'l1-unit'
  | 'l1-integration'
  | 'l2-integration'
  | 'l2-e2e'
  | 'l3'
  | 'not-a-test';

export interface PolicyViolation {
  code: string;
  message: string;
}

export interface ChildResult {
  artifact: string;
  command: string;
  durationMs: number;
  exitCode: number;
  layer: Exclude<TestLayer, 'not-a-test'>;
  selected: number;
  status: 'passed' | 'failed' | 'not-applicable';
}

export interface AggregateResult {
  schemaVersion: 1;
  project: string;
  status: 'passed' | 'failed';
  startedAt: string;
  durationMs: number;
  children: ChildResult[];
}

const LAYERS = new Set([
  'l1-unit',
  'l1-integration',
  'l2-integration',
  'l2-e2e',
  'l3',
]);

export function classifyTestFile(path: string, source: string): TestLayer {
  if (path.endsWith('.feature')) return 'l3';
  if (path.endsWith('.steps.ts')) return 'l3';
  if (path.endsWith('.test.ts')) {
    return source.includes('[L1:INTEGRATION]') && !source.includes('[L1:UNIT]')
      ? 'l1-integration'
      : 'l1-unit';
  }
  if (path.endsWith('.spec.ts')) {
    return source.includes('[L2:E2E]') && !source.includes('[L2:INTEGRATION]')
      ? 'l2-e2e'
      : 'l2-integration';
  }
  return 'not-a-test';
}

function violation(code: string, message: string): PolicyViolation {
  return { code, message };
}

export function analyzeTestSource(
  path: string,
  source: string,
): PolicyViolation[] {
  const violations: PolicyViolation[] = [];
  if (
    path.endsWith('.test.ts') &&
    (!source.includes('=== L1:') || !/\[L1:(?:UNIT|INTEGRATION)\]/.test(source))
  ) {
    violations.push(
      violation(
        'MISSING_L1_MARKER',
        'L1 tests require an owned marker and suite label',
      ),
    );
  }
  if (
    path.endsWith('.spec.ts') &&
    (!source.includes('=== L2:') || !/\[L2:(?:INTEGRATION|E2E)\]/.test(source))
  ) {
    violations.push(
      violation(
        'MISSING_L2_MARKER',
        'L2 tests require an owned marker and suite label',
      ),
    );
  }
  const l1Unit = source.indexOf('=== L1: UNIT TESTS ===');
  const l1Integration = source.indexOf(
    '=== L1: IN-PROCESS INTEGRATION TESTS ===',
  );
  if (
    path.endsWith('.test.ts') &&
    l1Unit >= 0 &&
    l1Integration >= 0 &&
    l1Unit > l1Integration
  ) {
    violations.push(
      violation(
        'L1_MARKER_ORDER',
        'L1 unit suites must precede integration suites',
      ),
    );
  }
  const l2Integration = source.indexOf(
    '=== L2: REAL-BOUNDARY INTEGRATION TESTS ===',
  );
  const l2E2e = source.indexOf('=== L2: END-TO-END TESTS ===');
  if (
    path.endsWith('.spec.ts') &&
    l2Integration >= 0 &&
    l2E2e >= 0 &&
    l2Integration > l2E2e
  ) {
    violations.push(
      violation(
        'L2_MARKER_ORDER',
        'L2 integration suites must precede e2e suites',
      ),
    );
  }

  const importLines =
    source.match(
      /^\s*import[\s\S]*?from\s+['"][^'"]+['"];?|^\s*import\s+['"][^'"]+['"];?/gm,
    ) ?? [];
  if (
    (path.endsWith('.steps.ts') &&
      importLines.some((line) => /\.(?:test|spec)\.ts['"]/.test(line))) ||
    (path.endsWith('.spec.ts') &&
      importLines.some((line) => /\.test\.ts['"]/.test(line)))
  ) {
    violations.push(
      violation(
        'CROSS_LAYER_IMPORT',
        'Test entrypoints cannot be imported across layers',
      ),
    );
  }

  if (path.endsWith('.steps.ts')) {
    if (
      /(?:spawn|spawnSync|exec|execFile|execSync|execFileSync)\s*\([\s\S]*?test-l[12]/.test(
        source,
      )
    ) {
      violations.push(
        violation(
          'CUCUMBER_RUNNER_OF_RUNNERS',
          'Cucumber steps cannot execute L1 or L2 targets',
        ),
      );
    }
    if (/expect\s*\(\s*true\s*\)\.toBe\s*\(\s*true\s*\)/.test(source)) {
      violations.push(
        violation('NO_OP_ASSERTION', 'No-op assertions are not evidence'),
      );
    }
    const thenBodies = [
      ...source.matchAll(
        /Then\s*\([^,]+,\s*(?:async\s*)?(?:function[^{]*|\([^)]*\)\s*=>)\s*\{([\s\S]*?)\}\s*\)/g,
      ),
    ].map((match) => match[1] ?? '');
    if (
      thenBodies.length > 0 &&
      thenBodies.some((body) => !/(?:assert\.|assert\(|expect\s*\()/.test(body))
    ) {
      violations.push(
        violation(
          'ASSERTION_FREE_THEN',
          'Every Then binding must assert an observable outcome',
        ),
      );
    }
    if (
      thenBodies.some(
        (body) =>
          /expect\.(?:poll|element)\s*\(/.test(body) &&
          !/await\s+expect\./.test(body),
      )
    ) {
      violations.push(
        violation(
          'UNAWAITED_ASYNC_ASSERTION',
          'Asynchronous assertions must be awaited',
        ),
      );
    }
  }

  if (path.endsWith('.profile.json')) {
    try {
      const profile = JSON.parse(source) as {
        surfaces?: Record<string, { status?: string }>;
      };
      for (const surface of ['web', 'mobile']) {
        const status = profile.surfaces?.[surface]?.status;
        if (status !== 'applicable' && status !== 'not-applicable') {
          violations.push(
            violation(
              'SURFACE_APPLICABILITY',
              `${surface} must be applicable or not-applicable`,
            ),
          );
        }
      }
    } catch {
      violations.push(
        violation('INVALID_PROFILE', 'Testing profile JSON must parse'),
      );
    }
  }

  return violations;
}

export function normalizeGitNameStatus(input: string): string[] {
  const tokens = input.split('\0').filter(Boolean);
  const files = new Set<string>();
  for (let index = 0; index < tokens.length; ) {
    const status = tokens[index++];
    if (!status) break;
    const path = tokens[index++];
    if (path) files.add(path);
    if (status.startsWith('R') || status.startsWith('C')) {
      const destination = tokens[index++];
      if (destination) files.add(destination);
    }
  }
  return [...files].sort();
}

export function createAffectedInvocation(
  files: string[],
  targets: string[],
): string[] {
  const normalizedFiles = [...new Set(files)].sort();
  const normalizedTargets = [...new Set(targets)];
  return [
    'bun',
    'nx',
    'affected',
    '-t',
    normalizedTargets.join(','),
    '--files',
    normalizedFiles.join(','),
    '--outputStyle=static',
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isChildResult(value: unknown): value is ChildResult {
  if (!isRecord(value)) return false;
  const status = value.status;
  const selected = value.selected;
  const exitCode = value.exitCode;
  if (!LAYERS.has(String(value.layer))) return false;
  if (typeof value.artifact !== 'string' || value.artifact.length === 0)
    return false;
  if (typeof value.command !== 'string' || value.command.length === 0)
    return false;
  if (typeof value.durationMs !== 'number' || value.durationMs < 0)
    return false;
  if (
    typeof selected !== 'number' ||
    !Number.isInteger(selected) ||
    selected < 0
  )
    return false;
  if (typeof exitCode !== 'number' || !Number.isInteger(exitCode)) return false;
  if (status === 'not-applicable') return selected === 0 && exitCode === 0;
  if (status === 'passed') return selected > 0 && exitCode === 0;
  if (status === 'failed') return selected > 0 && exitCode !== 0;
  return false;
}

export function validateAggregateResult(
  value: unknown,
): value is AggregateResult {
  if (!isRecord(value)) return false;
  if (value.schemaVersion !== 1) return false;
  if (typeof value.project !== 'string' || value.project.length === 0)
    return false;
  if (
    typeof value.startedAt !== 'string' ||
    Number.isNaN(Date.parse(value.startedAt))
  )
    return false;
  if (typeof value.durationMs !== 'number' || value.durationMs < 0)
    return false;
  if (!Array.isArray(value.children) || value.children.length === 0)
    return false;
  if (!value.children.every(isChildResult)) return false;
  const hasFailure = value.children.some((child) => child.status === 'failed');
  return value.status === (hasFailure ? 'failed' : 'passed');
}

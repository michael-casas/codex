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

export interface StandingTargetInspection {
  configured: number;
  violations: PolicyViolation[];
}

export interface ChildResult {
  artifact: string;
  command: string;
  durationMs: number;
  executed: number | null;
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

function commandTokens(command: string): string[] {
  return (
    command.match(/(?:[^\s"'\\]+|\\.|"(?:\\.|[^"])*"|'(?:\\.|[^'])*')+/g) ?? []
  ).map((token) => {
    const quote = token[0];
    return quote && quote === token[token.length - 1] && /["']/.test(quote)
      ? token.slice(1, -1)
      : token;
  });
}

function localSelectionPath(token: string, projectRoot: string): string {
  const local = token.startsWith('./') ? token.slice(2) : token;
  return local.startsWith(`${projectRoot}/`)
    ? local.slice(projectRoot.length + 1)
    : local;
}

function passWithNoTestsEnabled(
  tokens: string[],
  configSource: string | undefined,
): boolean {
  const configSettings = [
    ...(configSource ? withoutJavaScriptComments(configSource) : '').matchAll(
      /\bpassWithNoTests\s*:\s*([^,}\n]+)/g,
    ),
  ];
  return (
    tokens.some((token) =>
      /^--pass(?:WithNoTests|-with-no-tests)(?:=true)?$/i.test(token),
    ) || configSettings.some((setting) => setting[1]?.trim() !== 'false')
  );
}

function withoutJavaScriptComments(source: string): string {
  let result = '';
  let quote: '"' | "'" | '`' | undefined;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index] ?? '';
    const next = source[index + 1] ?? '';
    if (quote) {
      result += character;
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = undefined;
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      result += character;
      continue;
    }
    if (character === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') index += 1;
      result += '\n';
      continue;
    }
    if (character === '/' && next === '*') {
      index += 2;
      while (
        index < source.length &&
        !(source[index] === '*' && source[index + 1] === '/')
      ) {
        if (source[index] === '\n') result += '\n';
        index += 1;
      }
      index += 1;
      continue;
    }
    result += character;
  }
  return result;
}

function withoutJavaScriptStringContents(source: string): string {
  let result = '';
  let quote: '"' | "'" | '`' | undefined;
  let escaped = false;
  for (const character of source) {
    if (quote) {
      if (character === '\n') result += '\n';
      else result += ' ';
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = undefined;
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      result += ' ';
    } else {
      result += character;
    }
  }
  return result;
}

function configStringArray(
  source: string,
  property: 'include' | 'exclude',
): string[] | null | undefined {
  const clean = withoutJavaScriptComments(source);
  const code = withoutJavaScriptStringContents(clean);
  const matches = [...code.matchAll(new RegExp(`\\b${property}\\s*:`, 'g'))];
  if (matches.length === 0) return undefined;
  if (matches.length !== 1 || matches[0]?.index === undefined) return null;
  let cursor = (matches[0].index ?? 0) + (matches[0][0]?.length ?? 0);
  while (/\s/.test(clean[cursor] ?? '')) cursor += 1;
  if (clean[cursor] !== '[') return null;
  cursor += 1;

  const values: string[] = [];
  for (;;) {
    while (/\s/.test(clean[cursor] ?? '')) cursor += 1;
    if (clean[cursor] === ']') return values;
    const quote = clean[cursor];
    if (quote !== '"' && quote !== "'") return null;
    cursor += 1;
    let value = '';
    let closed = false;
    while (cursor < clean.length) {
      const character = clean[cursor] ?? '';
      cursor += 1;
      if (character === quote) {
        closed = true;
        break;
      }
      if (character !== '\\') {
        value += character;
        continue;
      }
      const escaped = clean[cursor] ?? '';
      cursor += 1;
      if (escaped === quote || escaped === '\\') value += escaped;
      else return null;
    }
    if (!closed) return null;
    values.push(value);
    while (/\s/.test(clean[cursor] ?? '')) cursor += 1;
    if (clean[cursor] === ']') return values;
    if (clean[cursor] !== ',') return null;
    cursor += 1;
  }
}

function supportsStaticConfigSelection(source: string): boolean {
  const clean = withoutJavaScriptComments(source);
  const code = withoutJavaScriptStringContents(clean);
  return (
    /\btest\s*:\s*{/.test(code) &&
    !/\.\.\.|\bObject\.assign\s*\(|\.test\s*\./.test(code)
  );
}

function knownFileGlob(pattern: string): RegExp | undefined {
  if (
    pattern.length === 0 ||
    pattern.startsWith('!') ||
    /[[\]{}]/.test(pattern) ||
    /\*{3,}/.test(pattern)
  ) {
    return undefined;
  }
  let expression = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index] ?? '';
    if (character === '*' && pattern[index + 1] === '*') {
      if (pattern[index + 2] === '/') {
        expression += '(?:.*/)?';
        index += 2;
      } else {
        expression += '.*';
        index += 1;
      }
      continue;
    }
    if (character === '*') expression += '[^/]*';
    else if (character === '?') expression += '[^/]';
    else expression += character.replace(/[\\^$.*+?()[\]|]/g, '\\$&');
  }
  return new RegExp(`${expression}$`);
}

export function analyzeStandingTargetConfig(
  projectPath: string,
  source: string,
  testFiles: string[],
  readConfig: (path: string) => string | undefined,
): StandingTargetInspection {
  let project: {
    targets?: Record<
      string,
      {
        cache?: boolean;
        executor?: string;
        options?: { command?: string };
      }
    >;
  };
  try {
    project = JSON.parse(source) as typeof project;
  } catch {
    return {
      configured: 0,
      violations: [
        violation('INVALID_PROJECT_CONFIG', `${projectPath} must parse`),
      ],
    };
  }

  const targets = project.targets ?? {};
  const configured = ['test-l1', 'test-l2'].filter(
    (target) => targets[target] !== undefined,
  ).length;
  if (configured === 0) return { configured, violations: [] };

  const projectRoot = projectPath.replace(/\/project\.json$/, '');
  const violations: PolicyViolation[] = [];
  for (const [targetName, suffix] of [
    ['test-l1', '.test.ts'],
    ['test-l2', '.spec.ts'],
  ] as const) {
    const layerFiles = testFiles
      .filter(
        (file) => file.startsWith(`${projectRoot}/`) && file.endsWith(suffix),
      )
      .map((file) => file.slice(projectRoot.length + 1))
      .sort();
    const target = targets[targetName];
    if (layerFiles.length === 0) continue;
    if (!target) {
      violations.push(
        violation(
          'MISSING_STANDING_TARGET',
          `${projectPath} requires ${targetName} for ${layerFiles.join(', ')}`,
        ),
      );
      continue;
    }
    const command = target.options?.command ?? '';
    const tokens = commandTokens(command);
    const runnerIndex =
      tokens[0] === 'bun' && tokens[1] === 'x'
        ? 2
        : ['bun', 'bunx', 'npx'].includes(tokens[0] ?? '')
          ? 1
          : 0;
    if (
      target.executor !== 'nx:run-commands' ||
      tokens[runnerIndex] !== 'vitest' ||
      tokens[runnerIndex + 1] !== 'run'
    ) {
      violations.push(
        violation(
          'INVALID_STANDING_TARGET_RUNNER',
          `${projectPath} ${targetName} must invoke Vitest through Nx`,
        ),
      );
      continue;
    }
    if (tokens.some((token) => /[*?[\]{}]/.test(token))) {
      violations.push(
        violation(
          'INVALID_STANDING_TARGET_FILTER',
          `${projectPath} ${targetName} uses an unexpanded positional glob`,
        ),
      );
      continue;
    }
    const configPath = tokens.find(
      (token, index) => tokens[index - 1] === '--config',
    );
    const configSource = configPath ? readConfig(configPath) : undefined;
    if (configPath && configSource === undefined) {
      violations.push(
        violation(
          'STANDING_TARGET_CONFIG_UNREADABLE',
          `${projectPath} ${targetName} references an unreadable Vitest config`,
        ),
      );
    }
    if (passWithNoTestsEnabled(tokens, configSource)) {
      violations.push(
        violation(
          'PASS_WITH_NO_TESTS_ENABLED',
          `${projectPath} ${targetName} permits zero-test success`,
        ),
      );
    }
    if (targetName === 'test-l2' && target.cache !== false) {
      violations.push(
        violation(
          'LIVE_TARGET_CACHE_ENABLED',
          `${projectPath} ${targetName} must be uncached`,
        ),
      );
    }

    const allProjectTestFiles = testFiles
      .filter(
        (file) =>
          file.startsWith(`${projectRoot}/`) &&
          /\.(?:test|spec)\.ts$/.test(file),
      )
      .map((file) => file.slice(projectRoot.length + 1))
      .sort();
    const include = configSource
      ? configStringArray(configSource, 'include')
      : undefined;
    const exclude = configSource
      ? configStringArray(configSource, 'exclude')
      : undefined;
    const configArraysInvalid =
      include === null ||
      exclude === null ||
      (configSource !== undefined &&
        !supportsStaticConfigSelection(configSource));
    if (configArraysInvalid) {
      violations.push(
        violation(
          'STANDING_TARGET_SELECTION_UNPROVEN',
          `${projectPath} ${targetName} has a non-static include or exclude`,
        ),
      );
    }
    const includePatterns = (include ?? []).map((pattern) =>
      localSelectionPath(pattern, projectRoot),
    );
    const excludePatterns = (exclude ?? []).map((pattern) =>
      localSelectionPath(pattern, projectRoot),
    );
    const includeMatchers = includePatterns.map(knownFileGlob);
    const excludeMatchers = excludePatterns.map(knownFileGlob);
    if (
      includeMatchers.some((matcher) => matcher === undefined) ||
      excludeMatchers.some((matcher) => matcher === undefined)
    ) {
      violations.push(
        violation(
          'STANDING_TARGET_SELECTION_UNPROVEN',
          `${projectPath} ${targetName} uses an unsupported include or exclude`,
        ),
      );
    }
    const unmatchedIncludes = includePatterns.filter(
      (_pattern, index) =>
        !allProjectTestFiles.some((file) => includeMatchers[index]?.test(file)),
    );
    if (unmatchedIncludes.length > 0) {
      violations.push(
        violation(
          'STANDING_TARGET_UNMATCHED_INCLUDE',
          `${projectPath} ${targetName} has unmatched includes ${unmatchedIncludes.join(', ')}`,
        ),
        violation(
          'STANDING_TARGET_SELECTION_UNPROVEN',
          `${projectPath} ${targetName} cannot prove a nonzero exhaustive selection`,
        ),
      );
    }
    const configSelected = allProjectTestFiles.filter(
      (file) =>
        (include === undefined ||
          includeMatchers.some((matcher) => matcher?.test(file))) &&
        !excludeMatchers.some((matcher) => matcher?.test(file)),
    );
    const positionalTestFiles = tokens
      .map((token) => localSelectionPath(token, projectRoot))
      .filter((token) => /\.(?:test|spec)\.ts$/.test(token));
    const crossLayer = positionalTestFiles.filter((file) =>
      file.endsWith(suffix === '.test.ts' ? '.spec.ts' : '.test.ts'),
    );
    if (crossLayer.length > 0) {
      violations.push(
        violation(
          'STANDING_TARGET_CROSS_LAYER_SELECTION',
          `${projectPath} ${targetName} also selects ${crossLayer.join(', ')}`,
        ),
      );
    }
    const unmatched = positionalTestFiles.filter(
      (file) => !allProjectTestFiles.includes(file),
    );
    if (unmatched.length > 0) {
      violations.push(
        violation(
          'STANDING_TARGET_UNMATCHED_FILE',
          `${projectPath} ${targetName} names unknown files ${unmatched.join(', ')}`,
        ),
      );
    }
    if (positionalTestFiles.length > 0) {
      const missing = layerFiles.filter(
        (file) =>
          !positionalTestFiles.includes(file) || !configSelected.includes(file),
      );
      if (missing.length > 0) {
        violations.push(
          violation(
            'STANDING_TARGET_FILE_OMISSION',
            `${projectPath} ${targetName} omits ${missing.join(', ')}`,
          ),
        );
      }
      continue;
    }

    if (include === undefined || configArraysInvalid) {
      violations.push(
        violation(
          'STANDING_TARGET_SELECTION_UNPROVEN',
          `${projectPath} ${targetName} has no statically provable include`,
        ),
      );
    }
    const configCrossLayer = configSelected.filter((file) =>
      file.endsWith(suffix === '.test.ts' ? '.spec.ts' : '.test.ts'),
    );
    if (configCrossLayer.length > 0) {
      violations.push(
        violation(
          'STANDING_TARGET_CROSS_LAYER_SELECTION',
          `${projectPath} ${targetName} config selects ${configCrossLayer.join(', ')}`,
        ),
      );
    }
    const missing = layerFiles.filter((file) => !configSelected.includes(file));
    if (missing.length > 0) {
      violations.push(
        violation(
          'STANDING_TARGET_FILE_OMISSION',
          `${projectPath} ${targetName} omits ${missing.join(', ')}`,
        ),
      );
    }
    if (
      configSelected.length === 0 ||
      missing.length > 0 ||
      configCrossLayer.length > 0
    ) {
      violations.push(
        violation(
          'STANDING_TARGET_SELECTION_UNPROVEN',
          `${projectPath} ${targetName} does not select every intended layer file exclusively`,
        ),
      );
    }
  }

  return { configured, violations };
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
  if (
    value.executed !== undefined &&
    value.executed !== null &&
    (typeof value.executed !== 'number' ||
      !Number.isInteger(value.executed) ||
      value.executed < 0)
  ) {
    return false;
  }
  if (status === 'not-applicable') return selected === 0 && exitCode === 0;
  if (status === 'passed') return selected > 0 && exitCode === 0;
  if (status === 'failed') return exitCode !== 0;
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

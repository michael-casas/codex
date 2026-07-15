import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { stripVTControlCharacters } from 'node:util';

import {
  analyzeTestSource,
  type AggregateResult,
  type ChildResult,
} from './lib/testing.js';

interface SuiteManifest {
  artifact?: string;
  command?: string[];
  expected?: number | 'from-output' | 'vitest-output' | 'cucumber-output';
  groupHeading?: string;
  heading: string;
  layer: ChildResult['layer'];
  reason?: string;
}

interface AggregateManifest {
  project: string;
  result: string;
  suites: SuiteManifest[];
  temporaryDirectory?: string;
}

function selectedFromOutput(
  kind: SuiteManifest['expected'],
  stdout: string,
): number {
  const plain = stripVTControlCharacters(stdout);
  if (typeof kind === 'number') return kind;
  if (kind === 'from-output') {
    try {
      const parsed = JSON.parse(plain) as { selected?: unknown };
      if (typeof parsed.selected !== 'number')
        throw new Error('selected is absent');
      return parsed.selected;
    } catch {
      throw new Error('malformed machine result');
    }
  }
  if (kind === 'vitest-output') {
    const match = plain.match(/Tests\s+(\d+) passed(?:\s*\|\s*(\d+) skipped)?/);
    if (!match) throw new Error('malformed machine result');
    return Number(match[1]);
  }
  if (kind === 'cucumber-output') {
    const match = plain.match(/(\d+) scenario/);
    if (!match) throw new Error('malformed machine result');
    return Number(match[1]);
  }
  throw new Error('malformed machine result');
}

function runAggregate(manifestPath: string): number {
  const manifest = JSON.parse(
    readFileSync(manifestPath, 'utf8'),
  ) as AggregateManifest;
  const startedAt = new Date();
  const children: ChildResult[] = [];
  let aggregateExit = 0;
  if (manifest.temporaryDirectory)
    mkdirSync(manifest.temporaryDirectory, { recursive: true });
  try {
    for (const [index, suite] of manifest.suites.entries()) {
      if (suite.groupHeading) console.log(suite.groupHeading);
      console.log(suite.heading);
      if (!suite.command) {
        children.push({
          artifact: suite.artifact ?? `na://${manifest.project}/${suite.layer}`,
          command: suite.reason ?? 'N/A',
          durationMs: 0,
          exitCode: 0,
          layer: suite.layer,
          selected: 0,
          status: 'not-applicable',
        });
        continue;
      }
      const command = [...suite.command];
      if (
        process.env.GROUND_ZERO_UNCACHED === '1' &&
        command[0] === 'bun' &&
        command[1] === 'nx'
      ) {
        command.push('--skipNxCache');
      }
      const childStarted = performance.now();
      const run = spawnSync(command[0], command.slice(1), { encoding: 'utf8' });
      const durationMs = Math.round(performance.now() - childStarted);
      if (run.stdout) process.stdout.write(run.stdout);
      if (run.stderr) process.stderr.write(run.stderr);
      let exitCode = run.status ?? 1;
      let selected = typeof suite.expected === 'number' ? suite.expected : 0;
      try {
        selected = selectedFromOutput(suite.expected, run.stdout ?? '');
        if (selected === 0 && exitCode === 0) {
          console.error(`${suite.layer} selected zero tests`);
          exitCode = 1;
        }
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        exitCode = exitCode === 0 ? 1 : exitCode;
      }
      if (aggregateExit === 0 && exitCode !== 0) aggregateExit = exitCode;
      children.push({
        artifact: suite.artifact ?? `${manifest.result}#child-${index + 1}`,
        command: command.join(' '),
        durationMs,
        exitCode,
        layer: suite.layer,
        selected: Math.max(selected, 1),
        status: exitCode === 0 ? 'passed' : 'failed',
      });
    }
  } finally {
    if (manifest.temporaryDirectory) {
      rmSync(manifest.temporaryDirectory, { force: true, recursive: true });
    }
  }
  const result: AggregateResult = {
    schemaVersion: 1,
    project: manifest.project,
    status: aggregateExit === 0 ? 'passed' : 'failed',
    startedAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    children,
  };
  mkdirSync(dirname(manifest.result), { recursive: true });
  writeFileSync(manifest.result, `${JSON.stringify(result, null, 2)}\n`);
  return aggregateExit;
}

function findNodeModules(start: string): string | undefined {
  let current = resolve(start);
  while (dirname(current) !== current) {
    const candidate = join(current, 'node_modules');
    if (existsSync(join(candidate, '@cucumber', 'cucumber'))) return candidate;
    current = dirname(current);
  }
  return undefined;
}

function cucumberFailure(statuses: string[]): string | undefined {
  if (statuses.includes('UNDEFINED')) return 'an undefined step';
  if (statuses.includes('AMBIGUOUS')) return 'an ambiguous step';
  if (statuses.includes('PENDING')) return 'a pending scenario';
  if (statuses.includes('SKIPPED')) return 'a skipped scenario';
  return undefined;
}

function runCucumberVerification(
  feature: string,
  steps: string,
  artifact?: string,
): number {
  feature = resolve(feature);
  steps = resolve(steps);
  artifact = artifact ? resolve(artifact) : undefined;
  const violations = analyzeTestSource(steps, readFileSync(steps, 'utf8'));
  const assertionViolation = violations.find(
    (item) => item.code === 'ASSERTION_FREE_THEN',
  );
  if (assertionViolation) {
    console.error('an assertion-free binding');
    return 1;
  }
  if (violations.length > 0) {
    console.error(violations.map((item) => item.message).join('\n'));
    return 1;
  }

  const fixtureRoot = dirname(feature);
  const localModules = join(fixtureRoot, 'node_modules');
  let createdModulesLink = false;
  if (!existsSync(localModules)) {
    const workspaceModules = findNodeModules(process.cwd());
    if (workspaceModules) {
      symlinkSync(realpathSync(workspaceModules), localModules, 'dir');
      createdModulesLink = true;
    }
  }
  const resultPath = artifact ?? join(fixtureRoot, '.cucumber-result.json');
  const cucumber = resolve('node_modules/.bin/cucumber-js');
  try {
    const run = spawnSync(
      cucumber,
      [
        '--import',
        steps,
        '--format',
        'progress',
        '--format',
        `json:${resultPath}`,
        feature,
      ],
      { cwd: fixtureRoot, encoding: 'utf8' },
    );
    if (run.stdout) process.stdout.write(run.stdout);
    if (run.stderr) process.stderr.write(run.stderr);
    if (!existsSync(resultPath)) {
      console.error('malformed machine result');
      return run.status ?? 1;
    }
    const report = JSON.parse(readFileSync(resultPath, 'utf8')) as Array<{
      elements?: Array<{ steps?: Array<{ result?: { status?: string } }> }>;
    }>;
    const statuses = report.flatMap((entry) =>
      (entry.elements ?? []).flatMap((scenario) =>
        (scenario.steps ?? []).map((step) =>
          String(step.result?.status ?? '').toUpperCase(),
        ),
      ),
    );
    const invalid = cucumberFailure(statuses);
    if (invalid) {
      console.error(invalid);
      return 1;
    }
    const scenarios = report.reduce(
      (count, entry) => count + (entry.elements?.length ?? 0),
      0,
    );
    if (scenarios === 0) {
      console.error('selected zero scenarios');
      return 1;
    }
    return run.status ?? 1;
  } finally {
    if (!artifact) rmSync(resultPath, { force: true });
    if (createdModulesLink) rmSync(localModules, { force: true });
  }
}

function policyFiles(paths: string[]): string[] {
  const result: string[] = [];
  for (const path of paths) {
    const absolute = resolve(path);
    if (!existsSync(absolute)) continue;
    const entries = readdirSync(absolute, { withFileTypes: true });
    for (const entry of entries) {
      if (
        ['node_modules', 'dist', 'out-tsc', 'test-output'].includes(entry.name)
      )
        continue;
      const child = join(absolute, entry.name);
      if (entry.isDirectory()) result.push(...policyFiles([child]));
      else if (
        /\.(?:test|spec|steps)\.ts$/.test(entry.name) ||
        entry.name.endsWith('.profile.json')
      ) {
        result.push(child);
      }
    }
  }
  return result;
}

function runPolicy(paths: string[]): number {
  const files = policyFiles(paths);
  if (files.length === 0) {
    console.error('testing policy selected zero files');
    return 1;
  }
  const violations = files.flatMap((file) =>
    analyzeTestSource(file, readFileSync(file, 'utf8')).map((item) => ({
      file,
      ...item,
    })),
  );
  if (violations.length > 0) {
    for (const item of violations)
      console.error(`${item.file}: ${item.code}: ${item.message}`);
    return 1;
  }
  console.log(JSON.stringify({ selected: files.length, status: 'passed' }));
  return 0;
}

const [command, ...args] = process.argv.slice(2);
let exitCode = 64;
if (command === 'aggregate' && args[0]) {
  exitCode = runAggregate(args[0]);
} else if (command === 'verify-cucumber' && args[0] && args[1]) {
  exitCode = runCucumberVerification(args[0], args[1], args[2]);
} else if (command === 'policy' && args.length > 0) {
  exitCode = runPolicy(args);
} else {
  console.error(
    'Usage: cli.ts aggregate <manifest> | verify-cucumber <feature> <steps> [artifact] | policy <paths...>',
  );
}
process.exitCode = exitCode;

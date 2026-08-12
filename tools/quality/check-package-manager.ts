import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const foreignLocks = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
]);
const excludedDirectories = new Set([
  '.agent',
  '.bun',
  '.git',
  '.nx',
  '.pi',
  'coverage',
  'dist',
  'node_modules',
  'out-tsc',
  'test-output',
  'tmp',
]);

function collect(directory: string, violations: string[]): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collect(path, violations);
    else if (foreignLocks.has(entry.name))
      violations.push(relative(root, path));
  }
}

const manifest = JSON.parse(
  readFileSync(join(root, 'package.json'), 'utf8'),
) as {
  packageManager?: unknown;
  private?: unknown;
  workspaces?: unknown;
};
const violations: string[] = [];

if (manifest.packageManager !== 'bun@1.3.14') {
  violations.push('package.json must declare packageManager=bun@1.3.14');
}
if (manifest.private !== true)
  violations.push('package.json must remain private');
if (
  JSON.stringify(manifest.workspaces) !==
  JSON.stringify(['apps/*', 'packages/*'])
) {
  violations.push(
    'package.json workspaces must be exactly apps/* and packages/*',
  );
}
if (!existsSync(join(root, 'bun.lock'))) violations.push('bun.lock is missing');
collect(root, violations);

if (violations.length > 0) {
  for (const violation of violations.sort()) console.error(violation);
  process.exit(1);
}

console.log(
  JSON.stringify({
    foreignLocks: 0,
    packageManager: manifest.packageManager,
    status: 'passed',
  }),
);

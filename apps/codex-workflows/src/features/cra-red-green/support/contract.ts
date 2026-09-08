import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export const BUN_REACT_AUDIT_CRITERIA = [
  {
    id: 'BUN-REACT-AUDIT-001',
    summary: 'Pinned Vite React package, bun.lock, and Bun-only scripts are present.',
  },
  {
    id: 'BUN-REACT-AUDIT-002',
    summary: 'The homepage renders the exact Workflow Proof heading.',
  },
  {
    id: 'BUN-REACT-AUDIT-003',
    summary: 'The homepage renders the exact audit-remediation status.',
  },
  {
    id: 'BUN-REACT-AUDIT-004',
    summary: 'The native Bun App test asserts the remediation status.',
  },
  {
    id: 'BUN-REACT-AUDIT-005',
    summary: 'Bun install, native test, and production build commands pass.',
  },
] as const;

export type BunReactAuditCriterionId =
  (typeof BUN_REACT_AUDIT_CRITERIA)[number]['id'];

export interface BunReactCommandValidation {
  installExitCode: number;
  testExitCode: number;
  buildExitCode: number;
  executable: 'bun';
  installOutput?: string;
  testOutput?: string;
  buildOutput?: string;
}

export interface BunReactAuditFinding {
  id: BunReactAuditCriterionId;
  status: 'PASS' | 'FAIL';
  summary: string;
}

export interface BunReactAuditResult {
  verdict: 'RED' | 'GREEN';
  treeDigest: `sha256:${string}`;
  findings: BunReactAuditFinding[];
}

export interface BunReactTreeSnapshot {
  digest: `sha256:${string}`;
  files: Record<string, `sha256:${string}`>;
}

const EXCLUDED_DIRECTORIES = new Set([
  '.git',
  'coverage',
  'dist',
  'node_modules',
]);

const FOREIGN_LOCKS = [
  'package-lock.json',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'yarn.lock',
] as const;

function digest(bytes: string | Uint8Array): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function within(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return (
    path === '' ||
    (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path))
  );
}

async function admittedProjectRoot(
  projectRoot: string,
  allowedRoot?: string,
): Promise<string> {
  const project = await realpath(resolve(projectRoot));
  if (allowedRoot) {
    const allowed = await realpath(resolve(allowedRoot));
    if (!within(allowed, project) || project === allowed) {
      throw new Error('Bun React proof project escaped its admitted proof root.');
    }
  }
  return project;
}

export async function snapshotBunReactTree(
  projectRoot: string,
  allowedRoot?: string,
): Promise<BunReactTreeSnapshot> {
  const root = await admittedProjectRoot(projectRoot, allowedRoot);
  const files: Record<string, `sha256:${string}`> = {};

  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.isDirectory() && EXCLUDED_DIRECTORIES.has(entry.name)) continue;
      const path = resolve(directory, entry.name);
      const relativePath = relative(root, path).split(sep).join('/');
      const metadata = await lstat(path);
      if (metadata.isSymbolicLink()) {
        throw new Error(
          `Bun React proof source must not contain symlinks: ${relativePath}`,
        );
      }
      if (metadata.isDirectory()) await visit(path);
      else if (metadata.isFile()) files[relativePath] = digest(await readFile(path));
    }
  };

  await visit(root);
  const canonical = Object.entries(files)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, fileDigest]) => `${path}\0${fileDigest}\n`)
    .join('');
  return { digest: digest(canonical), files };
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function pinnedBunVitePackage(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const source = value as Record<string, unknown>;
  const dependencies =
    typeof source.dependencies === 'object' && source.dependencies !== null
      ? (source.dependencies as Record<string, unknown>)
      : {};
  const devDependencies =
    typeof source.devDependencies === 'object' && source.devDependencies !== null
      ? (source.devDependencies as Record<string, unknown>)
      : {};
  const scripts =
    typeof source.scripts === 'object' && source.scripts !== null
      ? (source.scripts as Record<string, unknown>)
      : {};
  return (
    source.packageManager === 'bun@1.4.2' &&
    typeof dependencies.react === 'string' &&
    typeof dependencies['react-dom'] === 'string' &&
    devDependencies.vite === '^8.2.2' &&
    devDependencies['@vitejs/plugin-react'] === '^6.1.0' &&
    scripts.dev === 'vite' &&
    scripts.build === 'vite build' &&
    scripts.test === 'bun test'
  );
}

async function optionalText(root: string, path: string): Promise<string> {
  try {
    return await readFile(resolve(root, path), 'utf8');
  } catch {
    return '';
  }
}

export async function auditBunReactProject(
  projectRoot: string,
  commands: BunReactCommandValidation,
  allowedRoot?: string,
): Promise<BunReactAuditResult> {
  const root = await admittedProjectRoot(projectRoot, allowedRoot);
  const [packageBytes, app, appTest, bunLock, foreignLocks, snapshot] =
    await Promise.all([
      optionalText(root, 'package.json'),
      optionalText(root, 'src/App.jsx'),
      optionalText(root, 'src/App.test.jsx'),
      optionalText(root, 'bun.lock'),
      Promise.all(FOREIGN_LOCKS.map((path) => exists(resolve(root, path)))),
      snapshotBunReactTree(root, allowedRoot),
    ]);
  let packageValue: unknown;
  try {
    packageValue = JSON.parse(packageBytes) as unknown;
  } catch {
    packageValue = null;
  }

  const passes: Record<BunReactAuditCriterionId, boolean> = {
    'BUN-REACT-AUDIT-001':
      pinnedBunVitePackage(packageValue) &&
      bunLock.length > 0 &&
      foreignLocks.every((present) => !present),
    'BUN-REACT-AUDIT-002': /<h1>\s*Workflow Proof\s*<\/h1>/.test(app),
    'BUN-REACT-AUDIT-003':
      /data-testid=["']audit-remediation-status["']/.test(app) &&
      /Audit findings resolved/.test(app),
    'BUN-REACT-AUDIT-004':
      /audit-remediation-status/.test(appTest) &&
      /Audit findings resolved/.test(appTest) &&
      /expect\s*\(/.test(appTest),
    'BUN-REACT-AUDIT-005':
      commands.executable === 'bun' &&
      commands.installExitCode === 0 &&
      commands.testExitCode === 0 &&
      commands.buildExitCode === 0,
  };
  const findings = BUN_REACT_AUDIT_CRITERIA.map((criterion) => ({
    ...criterion,
    status: passes[criterion.id] ? ('PASS' as const) : ('FAIL' as const),
  }));
  return {
    verdict: findings.every((finding) => finding.status === 'PASS')
      ? 'GREEN'
      : 'RED',
    treeDigest: snapshot.digest,
    findings,
  };
}

async function runBun(
  projectRoot: string,
  args: string[],
  timeoutMs: number,
): Promise<{ exitCode: number; output: string }> {
  return new Promise((resolveResult, rejectResult) => {
    let output = '';
    const child = spawn('bun', args, {
      cwd: projectRoot,
      env: {
        ...process.env,
        CI: 'true',
        BUN_INSTALL_CACHE_DIR: resolve(projectRoot, '..', 'bun-cache'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const timeout = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => { output += chunk; });
    child.stderr.on('data', (chunk: string) => { output += chunk; });
    child.once('error', rejectResult);
    child.once('close', (code) => {
      clearTimeout(timeout);
      resolveResult({ exitCode: code ?? 1, output: output.slice(-16_000) });
    });
  });
}

export async function validateBunReactCommands(
  projectRoot: string,
  timeoutMs = 300_000,
): Promise<BunReactCommandValidation> {
  const install = await runBun(projectRoot, ['install', '--frozen-lockfile'], timeoutMs);
  const test = await runBun(projectRoot, ['test'], timeoutMs);
  const build = await runBun(projectRoot, ['run', 'build'], timeoutMs);
  return {
    executable: 'bun',
    installExitCode: install.exitCode,
    testExitCode: test.exitCode,
    buildExitCode: build.exitCode,
    installOutput: install.output,
    testOutput: test.output,
    buildOutput: build.output,
  };
}

export function changedSourcePaths(
  before: BunReactTreeSnapshot,
  after: BunReactTreeSnapshot,
): string[] {
  const paths = new Set([...Object.keys(before.files), ...Object.keys(after.files)]);
  return [...paths]
    .filter((path) => before.files[path] !== after.files[path])
    .sort();
}

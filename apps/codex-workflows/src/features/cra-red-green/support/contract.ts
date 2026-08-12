import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export const CRA_AUDIT_CRITERIA = [
  {
    id: 'CRA-AUDIT-001',
    summary: 'Pinned Create React App package and scripts are present.',
  },
  {
    id: 'CRA-AUDIT-002',
    summary: 'The homepage renders the exact Workflow Proof heading.',
  },
  {
    id: 'CRA-AUDIT-003',
    summary: 'The homepage renders the exact audit-remediation status.',
  },
  {
    id: 'CRA-AUDIT-004',
    summary: 'The native App test asserts the remediation status.',
  },
  {
    id: 'CRA-AUDIT-005',
    summary: 'The native test and production build commands pass.',
  },
] as const;

export type CraAuditCriterionId = (typeof CRA_AUDIT_CRITERIA)[number]['id'];

export interface CraCommandValidation {
  testExitCode: number;
  buildExitCode: number;
  testOutput?: string;
  buildOutput?: string;
}

export interface CraAuditFinding {
  id: CraAuditCriterionId;
  status: 'PASS' | 'FAIL';
  summary: string;
}

export interface CraAuditResult {
  verdict: 'RED' | 'GREEN';
  treeDigest: `sha256:${string}`;
  findings: CraAuditFinding[];
}

export interface CraTreeSnapshot {
  digest: `sha256:${string}`;
  files: Record<string, `sha256:${string}`>;
}

const EXCLUDED_DIRECTORIES = new Set([
  '.git',
  'build',
  'coverage',
  'node_modules',
]);

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
      throw new Error('CRA proof project escaped its admitted proof root.');
    }
  }
  return project;
}

export async function snapshotCraTree(
  projectRoot: string,
  allowedRoot?: string,
): Promise<CraTreeSnapshot> {
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
          `CRA proof source must not contain symlinks: ${relativePath}`,
        );
      }
      if (metadata.isDirectory()) await visit(path);
      else if (metadata.isFile())
        files[relativePath] = digest(await readFile(path));
    }
  };

  await visit(root);
  const canonical = Object.entries(files)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, fileDigest]) => `${path}\0${fileDigest}\n`)
    .join('');
  return { digest: digest(canonical), files };
}

function pinnedCraPackage(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const source = value as Record<string, unknown>;
  const dependencies =
    typeof source.dependencies === 'object' && source.dependencies !== null
      ? (source.dependencies as Record<string, unknown>)
      : {};
  const scripts =
    typeof source.scripts === 'object' && source.scripts !== null
      ? (source.scripts as Record<string, unknown>)
      : {};
  return (
    typeof dependencies.react === 'string' &&
    typeof dependencies['react-dom'] === 'string' &&
    dependencies['react-scripts'] === '5.0.1' &&
    scripts.start === 'react-scripts start' &&
    scripts.build === 'react-scripts build' &&
    scripts.test === 'react-scripts test'
  );
}

async function optionalText(root: string, path: string): Promise<string> {
  try {
    return await readFile(resolve(root, path), 'utf8');
  } catch {
    return '';
  }
}

export async function auditCraProject(
  projectRoot: string,
  commands: CraCommandValidation,
  allowedRoot?: string,
): Promise<CraAuditResult> {
  const root = await admittedProjectRoot(projectRoot, allowedRoot);
  const [packageBytes, app, appTest, snapshot] = await Promise.all([
    optionalText(root, 'package.json'),
    optionalText(root, 'src/App.js'),
    optionalText(root, 'src/App.test.js'),
    snapshotCraTree(root, allowedRoot),
  ]);
  let packageValue: unknown;
  try {
    packageValue = JSON.parse(packageBytes) as unknown;
  } catch {
    packageValue = null;
  }

  const passes: Record<CraAuditCriterionId, boolean> = {
    'CRA-AUDIT-001': pinnedCraPackage(packageValue),
    'CRA-AUDIT-002': /<h1>\s*Workflow Proof\s*<\/h1>/.test(app),
    'CRA-AUDIT-003':
      /data-testid=["']audit-remediation-status["']/.test(app) &&
      /Audit findings resolved/.test(app),
    'CRA-AUDIT-004':
      /audit-remediation-status/.test(appTest) &&
      /Audit findings resolved/.test(appTest) &&
      /expect\s*\(/.test(appTest),
    'CRA-AUDIT-005':
      commands.testExitCode === 0 && commands.buildExitCode === 0,
  };
  const findings = CRA_AUDIT_CRITERIA.map((criterion) => ({
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

async function runCommand(
  projectRoot: string,
  args: string[],
  timeoutMs: number,
): Promise<{ exitCode: number; output: string }> {
  return new Promise((resolveResult, rejectResult) => {
    let output = '';
    const child = spawn('npm', args, {
      cwd: projectRoot,
      env: { ...process.env, CI: 'true' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const timeout = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      output += chunk;
    });
    child.once('error', rejectResult);
    child.once('close', (code) => {
      clearTimeout(timeout);
      resolveResult({ exitCode: code ?? 1, output: output.slice(-16_000) });
    });
  });
}

export async function validateCraCommands(
  projectRoot: string,
  timeoutMs = 300_000,
): Promise<CraCommandValidation> {
  const test = await runCommand(
    projectRoot,
    ['test', '--', '--watchAll=false'],
    timeoutMs,
  );
  const build = await runCommand(projectRoot, ['run', 'build'], timeoutMs);
  return {
    testExitCode: test.exitCode,
    buildExitCode: build.exitCode,
    testOutput: test.output,
    buildOutput: build.output,
  };
}

export function changedSourcePaths(
  before: CraTreeSnapshot,
  after: CraTreeSnapshot,
): string[] {
  const paths = new Set([
    ...Object.keys(before.files),
    ...Object.keys(after.files),
  ]);
  return [...paths]
    .filter((path) => before.files[path] !== after.files[path])
    .sort();
}

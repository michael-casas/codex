#!/usr/bin/env -S codex-workflows
import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import {
  access,
  chmod,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { delimiter, resolve } from 'node:path';

import {
  agent,
  artifact,
  defineWorkflow,
  phase,
  sha256,
  WorkflowExecutionError,
} from '@codex/workflows';

import {
  auditBunReactProject,
  changedSourcePaths,
  BUN_REACT_AUDIT_CRITERIA,
  snapshotBunReactTree,
  validateBunReactCommands,
  type BunReactAuditResult,
} from '../src/features/cra-red-green/support/contract.js';

interface BunReactRedGreenInput {
  utcTimestamp: string;
}

interface BuilderOutput {
  status: 'BASELINE_CREATED';
  projectPath: string;
}

interface ScaffoldProof {
  schemaVersion: 1;
  invocationCount: 1;
  executable: string;
  argv: string[];
  environment: {
    BUN_INSTALL_CACHE_DIR: string;
  };
  cwd: string;
  startedAt: string;
  completedAt: string;
  exitCode: 0;
  signal: null;
  tracePath: string;
  digest: `sha256:${string}`;
  attemptsPath: string;
  attemptsDigest: `sha256:${string}`;
  launcherDigest: `sha256:${string}`;
}

interface ScaffoldLauncher {
  launcherPath: string;
  lockPath: string;
  attemptsPath: string;
  tracePath: string;
  traceTemporaryPath: string;
  executable: string;
  argv: string[];
  environment: ScaffoldProof['environment'];
  cwd: string;
  launcherDigest: `sha256:${string}`;
}

interface AuditorFinding {
  id: string;
  status: 'PASS' | 'FAIL';
  summary: string;
}

interface AuditorOutput {
  verdict: 'RED';
  treeDigest: string;
  findings: AuditorFinding[];
}

interface RemediatorOutput {
  status: 'READY_FOR_EXTERNAL_AUDIT';
  projectPath: string;
  addressedFindings: string[];
  testExitCode: number;
  buildExitCode: number;
}

const builderSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'projectPath'],
  properties: {
    status: { type: 'string', enum: ['BASELINE_CREATED'] },
    projectPath: { type: 'string', minLength: 8, maxLength: 2048 },
  },
} as const;

const auditorSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'treeDigest', 'findings'],
  properties: {
    verdict: { type: 'string', enum: ['RED'] },
    treeDigest: { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' },
    findings: {
      type: 'array',
      minItems: 5,
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'status', 'summary'],
        properties: {
          id: {
            type: 'string',
            enum: BUN_REACT_AUDIT_CRITERIA.map((criterion) => criterion.id),
          },
          status: { type: 'string', enum: ['PASS', 'FAIL'] },
          summary: { type: 'string', minLength: 8, maxLength: 400 },
        },
      },
    },
  },
} as const;

const remediatorSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'status',
    'projectPath',
    'addressedFindings',
    'testExitCode',
    'buildExitCode',
  ],
  properties: {
    status: { type: 'string', enum: ['READY_FOR_EXTERNAL_AUDIT'] },
    projectPath: { type: 'string', minLength: 8, maxLength: 2048 },
    addressedFindings: {
      type: 'array',
      minItems: 1,
      maxItems: 5,
      items: {
        type: 'string',
        enum: BUN_REACT_AUDIT_CRITERIA.map((criterion) => criterion.id),
      },
    },
    testExitCode: { type: 'integer', minimum: 0, maximum: 255 },
    buildExitCode: { type: 'integer', minimum: 0, maximum: 255 },
  },
} as const;

function realTimestamp(value: string): boolean {
  if (!/^\d{8}T\d{6}Z$/.test(value)) return false;
  const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}.000Z`;
  return !Number.isNaN(Date.parse(iso)) && new Date(iso).toISOString() === iso;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function scaffoldProofFailure(message: string): never {
  throw new WorkflowExecutionError(
    'WORKFLOW_OUTPUT_SCHEMA_FAILED',
    `Bun React scaffold provenance failed closed: ${message}`,
  );
}

async function resolveExecutable(name: string): Promise<string> {
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    if (!directory) continue;
    const candidate = resolve(directory, name);
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Continue through the admitted process PATH.
    }
  }
  throw new WorkflowExecutionError(
    'WORKFLOW_AGENT_FAILED',
    `The required ${name} executable is not available on PATH.`,
  );
}

function renderScaffoldLauncher(
  config: Omit<ScaffoldLauncher, 'launcherDigest'>,
): string {
  const encoded = JSON.stringify({
    executable: config.executable,
    argv: config.argv,
    environment: config.environment,
    cwd: config.cwd,
    lockPath: config.lockPath,
    attemptsPath: config.attemptsPath,
    tracePath: config.tracePath,
    traceTemporaryPath: config.traceTemporaryPath,
  });
  return `#!/usr/bin/env node
import { appendFileSync, closeSync, openSync, renameSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const config = ${encoded};
const invocationId = randomUUID();
const invokedAt = new Date().toISOString();
appendFileSync(
  config.attemptsPath,
  JSON.stringify({ schemaVersion: 1, invocationId, pid: process.pid, invokedAt }) + '\\n',
  { encoding: 'utf8', mode: 0o600 },
);

let lock;
try {
  lock = openSync(config.lockPath, 'wx', 0o600);
  closeSync(lock);
} catch {
  process.stderr.write('Bun React scaffold launcher rejects every invocation after the first.\\n');
  process.exit(73);
}

const startedAt = new Date().toISOString();
const child = spawnSync(config.executable, config.argv, {
  cwd: config.cwd,
  env: { ...process.env, ...config.environment },
  stdio: 'inherit',
});
const completedAt = new Date().toISOString();
const trace = {
  schemaVersion: 1,
  invocationCount: 1,
  invocationId,
  executable: config.executable,
  argv: config.argv,
  environment: config.environment,
  cwd: config.cwd,
  startedAt,
  completedAt,
  exitCode: child.status,
  signal: child.signal,
};
writeFileSync(config.traceTemporaryPath, JSON.stringify(trace) + '\\n', {
  encoding: 'utf8',
  mode: 0o600,
  flag: 'wx',
});
renameSync(config.traceTemporaryPath, config.tracePath);
if (child.error) {
  process.stderr.write('Bun React scaffold process failed to launch.\\n');
}
process.exit(child.status ?? 1);
`;
}

async function prepareScaffoldLauncher(input: {
  workspace: string;
  proofRoot: string;
  projectPath: string;
}): Promise<ScaffoldLauncher> {
  const launcherPath = resolve(input.proofRoot, '.bun-react-scaffold-once.mjs');
  const lockPath = resolve(input.proofRoot, '.bun-react-scaffold.lock');
  const attemptsPath = resolve(input.proofRoot, 'BUN_REACT_SCAFFOLD_ATTEMPTS.jsonl');
  const tracePath = resolve(input.proofRoot, 'BUN_REACT_SCAFFOLD_TRACE.json');
  const traceTemporaryPath = resolve(
    input.proofRoot,
    '.BUN_REACT_SCAFFOLD_TRACE.json.tmp',
  );
  const config: Omit<ScaffoldLauncher, 'launcherDigest'> = {
    launcherPath,
    lockPath,
    attemptsPath,
    tracePath,
    traceTemporaryPath,
    executable: await resolveExecutable('bun'),
    argv: [
      'create',
      'vite@9.2.0',
      input.projectPath,
      '--template',
      'react',
    ],
    environment: {
      BUN_INSTALL_CACHE_DIR: resolve(input.proofRoot, 'bun-cache'),
    },
    cwd: input.workspace,
  };
  const source = renderScaffoldLauncher(config);
  await writeFile(launcherPath, source, {
    encoding: 'utf8',
    mode: 0o500,
    flag: 'wx',
  });
  await chmod(launcherPath, 0o500);
  return { ...config, launcherDigest: sha256(source) };
}

function parseJsonRecord(
  bytes: string,
  label: string,
): Record<string, unknown> {
  try {
    const value = JSON.parse(bytes) as unknown;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return scaffoldProofFailure(`${label} is not a JSON object.`);
    }
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof WorkflowExecutionError) throw error;
    return scaffoldProofFailure(`${label} is not valid JSON.`);
  }
}

async function validateScaffoldProof(
  launcher: ScaffoldLauncher,
): Promise<ScaffoldProof> {
  const [launcherBytes, attemptsBytes, traceBytes] = await Promise.all([
    readFile(launcher.launcherPath, 'utf8'),
    readFile(launcher.attemptsPath, 'utf8'),
    readFile(launcher.tracePath, 'utf8'),
  ]).catch(() => scaffoldProofFailure('required trace files are missing.'));
  if (sha256(launcherBytes) !== launcher.launcherDigest) {
    scaffoldProofFailure('the workflow-owned launcher was modified.');
  }
  const attemptLines = attemptsBytes.trim().split('\n').filter(Boolean);
  if (attemptLines.length !== 1) {
    scaffoldProofFailure(
      `the single-use launcher recorded ${attemptLines.length} invocations.`,
    );
  }
  const attempt = parseJsonRecord(attemptLines[0] ?? '', 'launcher attempt');
  const trace = parseJsonRecord(traceBytes, 'scaffold trace');
  const exactTrace =
    trace.schemaVersion === 1 &&
    trace.invocationCount === 1 &&
    typeof trace.invocationId === 'string' &&
    trace.invocationId === attempt.invocationId &&
    attempt.schemaVersion === 1 &&
    typeof attempt.pid === 'number' &&
    Number.isInteger(attempt.pid) &&
    attempt.pid > 0 &&
    typeof attempt.invokedAt === 'string' &&
    !Number.isNaN(Date.parse(attempt.invokedAt)) &&
    trace.executable === launcher.executable &&
    JSON.stringify(trace.argv) === JSON.stringify(launcher.argv) &&
    JSON.stringify(trace.environment) ===
      JSON.stringify(launcher.environment) &&
    trace.cwd === launcher.cwd &&
    typeof trace.startedAt === 'string' &&
    typeof trace.completedAt === 'string' &&
    !Number.isNaN(Date.parse(trace.startedAt)) &&
    !Number.isNaN(Date.parse(trace.completedAt)) &&
    Date.parse(trace.completedAt) >= Date.parse(trace.startedAt) &&
    trace.exitCode === 0 &&
    trace.signal === null;
  if (!exactTrace) {
    scaffoldProofFailure(
      'the recorded process boundary does not match the admitted command.',
    );
  }
  return {
    schemaVersion: 1,
    invocationCount: 1,
    executable: launcher.executable,
    argv: [...launcher.argv],
    environment: { ...launcher.environment },
    cwd: launcher.cwd,
    startedAt: String(trace.startedAt),
    completedAt: String(trace.completedAt),
    exitCode: 0,
    signal: null,
    tracePath: launcher.tracePath,
    digest: sha256(traceBytes),
    attemptsPath: launcher.attemptsPath,
    attemptsDigest: sha256(attemptsBytes),
    launcherDigest: launcher.launcherDigest,
  };
}

interface ScopedProcess {
  pid: number;
  command: string;
}

async function processesUsingProofRoot(
  proofRoot: string,
): Promise<ScopedProcess[]> {
  return new Promise((resolveProcesses, rejectProcesses) => {
    let stdout = '';
    let stderr = '';
    const child = spawn('ps', ['-axo', 'pid=,command='], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.once('error', rejectProcesses);
    child.once('close', (code) => {
      if (code !== 0) {
        rejectProcesses(
          new Error(`Unable to inspect Bun React proof processes: ${stderr.trim()}`),
        );
        return;
      }
      resolveProcesses(
        stdout
          .split('\n')
          .map((line) => /^\s*(\d+)\s+(.*)$/.exec(line))
          .filter((match): match is RegExpExecArray => match !== null)
          .map((match) => ({ pid: Number(match[1]), command: match[2] }))
          .filter(
            (entry) =>
              entry.pid !== process.pid && entry.command.includes(proofRoot),
          ),
      );
    });
  });
}

function signalProcess(processId: number, signal: NodeJS.Signals): void {
  try {
    process.kill(processId, signal);
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ESRCH'
    ) {
      return;
    }
    throw error;
  }
}

async function terminateProofRootProcesses(proofRoot: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const scoped = await processesUsingProofRoot(proofRoot);
    if (scoped.length === 0) return;
    for (const entry of scoped) signalProcess(entry.pid, 'SIGTERM');
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  for (const entry of await processesUsingProofRoot(proofRoot)) {
    signalProcess(entry.pid, 'SIGKILL');
  }
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if ((await processesUsingProofRoot(proofRoot)).length === 0) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new WorkflowExecutionError(
    'WORKFLOW_AGENT_FAILED',
    'Bun React proof-root subprocesses did not terminate before cleanup.',
  );
}

async function cleanupBunReactResources(
  projectPath: string,
  proofRoot: string,
): Promise<void> {
  await terminateProofRootProcesses(proofRoot);
  await Promise.all([
    rm(resolve(projectPath, 'node_modules'), { recursive: true, force: true }),
    rm(resolve(projectPath, 'dist'), { recursive: true, force: true }),
    rm(resolve(projectPath, '.git'), { recursive: true, force: true }),
    rm(resolve(proofRoot, 'bun-cache'), { recursive: true, force: true }),
    rm(resolve(proofRoot, '.bun-react-scaffold-once.mjs'), { force: true }),
    rm(resolve(proofRoot, '.bun-react-scaffold.lock'), { force: true }),
    rm(resolve(proofRoot, '.BUN_REACT_SCAFFOLD_TRACE.json.tmp'), { force: true }),
  ]);
}

function sameAudit(actual: AuditorOutput, expected: BunReactAuditResult): boolean {
  if (actual.verdict !== 'RED' || actual.treeDigest !== expected.treeDigest) {
    return false;
  }
  if (actual.findings.length !== expected.findings.length) return false;
  return expected.findings.every((finding, index) => {
    const candidate = actual.findings[index];
    return candidate?.id === finding.id && candidate.status === finding.status;
  });
}

function renderReport(input: {
  timestamp: string;
  projectPath: string;
  scaffoldProof: ScaffoldProof;
  baseline: BunReactAuditResult;
  auditor: AuditorOutput;
  final: BunReactAuditResult;
  changedPaths: string[];
  remediator: RemediatorOutput;
}): string {
  const findings = (audit: BunReactAuditResult | AuditorOutput) =>
    audit.findings
      .map(
        (finding) => `- ${finding.id}: ${finding.status} — ${finding.summary}`,
      )
      .join('\n');
  return `# Bun React RED → GREEN Workflow Proof

- Timestamp: ${input.timestamp}
- Generated project: ${input.projectPath}
- Scaffold invocation count: ${input.scaffoldProof.invocationCount}
- Scaffold process exit: ${input.scaffoldProof.exitCode} / signal ${String(input.scaffoldProof.signal)}
- Scaffold trace digest: ${input.scaffoldProof.digest}
- Scaffold attempts digest: ${input.scaffoldProof.attemptsDigest}
- Scaffold launcher digest: ${input.scaffoldProof.launcherDigest}
- Baseline verdict: ${input.baseline.verdict}
- Auditor verdict: ${input.auditor.verdict}
- Final verdict: ${input.final.verdict}
- Terminal marker: ${input.remediator.status}
- Baseline tree digest: ${input.baseline.treeDigest}
- Auditor tree digest: ${input.auditor.treeDigest}
- Final tree digest: ${input.final.treeDigest}
- Remediation source changes: ${input.changedPaths.join(', ')}

## Immutable baseline evaluation

${findings(input.baseline)}

## Independent auditor evaluation

${findings(input.auditor)}

## Deterministic final evaluation

${findings(input.final)}

<!-- BUN_REACT_RED_GREEN_COMPLETE -->
`;
}

export default defineWorkflow<BunReactRedGreenInput, unknown>({
  id: 'founder-bun-react-red-green',
  version: 1,
  description:
    'Build a pinned Bun/Vite React baseline, independently audit it RED, remediate the findings, and prove GREEN.',
  maxConcurrency: 1,
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['utcTimestamp'],
    properties: {
      utcTimestamp: { type: 'string', pattern: '^\\d{8}T\\d{6}Z$' },
    },
  },
  async run(input) {
    if (!realTimestamp(input.utcTimestamp)) {
      throw new WorkflowExecutionError(
        'WORKFLOW_INPUT_INVALID',
        'utcTimestamp must be a real UTC calendar timestamp.',
      );
    }
    const workspace = resolve(process.cwd());
    const proofRoot = resolve(
      workspace,
      `.agent/testing/workflows/${input.utcTimestamp}`,
    );
    const projectPath = resolve(proofRoot, 'bun-react-proof-app');
    if (await pathExists(projectPath)) {
      throw new WorkflowExecutionError(
        'WORKFLOW_INPUT_INVALID',
        'The isolated Bun React proof project already exists.',
      );
    }
    await mkdir(proofRoot, { recursive: true, mode: 0o700 });

    try {
      const scaffoldLauncher = await prepareScaffoldLauncher({
        workspace,
        proofRoot,
        projectPath,
      });
      const builder = await phase('implementation', () =>
        agent<BuilderOutput>({
          label: 'bun-react-builder',
          model: 'gpt-5.6-luna',
          reasoning: 'low',
          commandEvidence: {
            rules: [
              {
                id: 'workflow-bun-vite-scaffold-launcher',
                includes: scaffoldLauncher.launcherPath,
                expectedCount: 1,
              },
              {
                id: 'direct-create-vite',
                includes: 'vite@9.2.0',
                expectedCount: 0,
              },
              { id: 'foreign-npm', includes: 'npm', expectedCount: 0 },
              { id: 'foreign-npx', includes: 'npx', expectedCount: 0 },
              { id: 'foreign-pnpm', includes: 'pnpm', expectedCount: 0 },
              { id: 'foreign-yarn', includes: 'yarn', expectedCount: 0 },
            ],
          },
          prompt: `__BUN_REACT_RED_GREEN_BUILDER__
Do not emit commentary, progress updates, or interim assistant messages. Perform the work first, then emit exactly one final schema-bound JSON response.
Create a brand-new Vite React project at the exact absolute path ${JSON.stringify(projectPath)}. Invoke this exact workflow-owned launcher once: ${JSON.stringify(scaffoldLauncher.launcherPath)}. Do not inspect, read, print, stat, quote, or otherwise reference the launcher path in any other command; its single execution must be the only command containing that path. The launcher is configured with Bun 1.4.2 and pinned create-vite@9.2.0, records the child process boundary, and rejects every invocation after the first. Do not invoke create-vite or any alternate scaffold command directly; do not retry the launcher or scaffold; never invoke npm, npx, pnpm, or Yarn; and do not create or edit anything outside the project path or the named Bun cache path ${JSON.stringify(resolve(proofRoot, 'bun-cache'))}.

After scaffolding, set packageManager to exactly bun@1.4.2 and add the exact package script test: bun test. Do not add or replace dependencies and do not create any foreign lockfile. Set BUN_INSTALL_CACHE_DIR to ${JSON.stringify(resolve(proofRoot, 'bun-cache'))} for every Bun command. Run bun install so the project produces bun.lock. Make src/App.jsx render exactly one <h1>Workflow Proof</h1> and omit audit-remediation-status and the words Audit findings resolved. Create src/App.test.jsx using bun:test and react-dom/server so it executes an assertion for the Workflow Proof heading. Run bun test and bun run build. If a command yields, poll it to terminal completion. Remove nested .git metadata, but retain node_modules until host validation. Return only the schema-bound JSON with status BASELINE_CREATED and the exact projectPath. Scaffold provenance and command exits are host-owned.`,
          outputSchema: builderSchema,
        }),
      );
      if (builder.projectPath !== projectPath) {
        throw new WorkflowExecutionError(
          'WORKFLOW_OUTPUT_SCHEMA_FAILED',
          'Builder output did not identify the admitted pinned Bun React project.',
        );
      }
      const scaffoldProof = await validateScaffoldProof(scaffoldLauncher);
      await Promise.all([
        rm(scaffoldLauncher.launcherPath, { force: true }),
        rm(scaffoldLauncher.lockPath, { force: true }),
        rm(scaffoldLauncher.traceTemporaryPath, { force: true }),
      ]);

      const baselineCommands = await validateBunReactCommands(projectPath);
      const baseline = await auditBunReactProject(
        projectPath,
        baselineCommands,
        proofRoot,
      );
      const expectedBaselineFailures = ['BUN-REACT-AUDIT-003', 'BUN-REACT-AUDIT-004'];
      const baselineFailures = baseline.findings
        .filter((finding) => finding.status === 'FAIL')
        .map((finding) => finding.id);
      if (
        baseline.verdict !== 'RED' ||
        JSON.stringify(baselineFailures) !==
          JSON.stringify(expectedBaselineFailures)
      ) {
        throw new WorkflowExecutionError(
          'WORKFLOW_OUTPUT_SCHEMA_FAILED',
          'The builder did not produce the contractually RED minimal baseline.',
        );
      }
      const beforeAudit = await snapshotBunReactTree(projectPath, proofRoot);

      const auditor = await phase('audit', () =>
        agent<AuditorOutput>({
          label: 'bun-react-auditor',
          model: 'gpt-5.6-luna',
          reasoning: 'low',
          prompt: `__BUN_REACT_RED_GREEN_AUDITOR__
Do not emit commentary, progress updates, or interim assistant messages. Perform the work first, then emit exactly one final schema-bound JSON response.
Act as an independent read-only auditor. Inspect the exact project path supplied in workflow input and evaluate only the supplied immutable five-criterion audit. The scaffoldProof was independently validated from a single-use Bun/create-vite process trace. The deterministicBaseline was produced by fresh host-owned Bun install, test, and build commands and is authoritative; copy its five IDs, statuses, and summaries exactly in order. NEVER mutate, install, build, or test. Do not invent or relax criteria. Return all five findings in order, the exact tree digest, and verdict RED as schema-bound JSON.`,
          input: { builder, scaffoldProof, deterministicBaseline: baseline },
          outputSchema: auditorSchema,
        }),
      );
      const afterAudit = await snapshotBunReactTree(projectPath, proofRoot);
      if (
        beforeAudit.digest !== afterAudit.digest ||
        !sameAudit(auditor, baseline)
      ) {
        throw new WorkflowExecutionError(
          'WORKFLOW_OUTPUT_SCHEMA_FAILED',
          'Independent auditor mutated the project or diverged from the fixed audit.',
        );
      }

      const remediator = await phase('remediation', () =>
        agent<RemediatorOutput>({
          label: 'bun-react-remediator',
          model: 'gpt-5.6-luna',
          reasoning: 'low',
          prompt: `__BUN_REACT_RED_GREEN_REMEDIATOR__
Do not emit commentary, progress updates, or interim assistant messages. Perform the work first, then emit exactly one final schema-bound JSON response.
Remediate only the FAIL findings in the supplied independent audit at the exact project path. Never invoke npm, npx, pnpm, or Yarn. Do not alter package.json, bun.lock, public files, configuration, or dependencies and do not create foreign lockfiles. Edit only src/App.jsx and src/App.test.jsx. Preserve the exact Workflow Proof h1. Add one element with data-testid="audit-remediation-status" and exact visible text Audit findings resolved, then use expect( from bun:test to assert the exact rendered status markup. Set BUN_INSTALL_CACHE_DIR to ${JSON.stringify(resolve(proofRoot, 'bun-cache'))}, then run bun test and bun run build to terminal completion. Return only schema-bound JSON with status READY_FOR_EXTERNAL_AUDIT, the exact projectPath, addressedFindings exactly ["BUN-REACT-AUDIT-003", "BUN-REACT-AUDIT-004"], and actual terminal exit codes.`,
          input: { builder, audit: auditor },
          outputSchema: remediatorSchema,
        }),
      );
      if (
        remediator.projectPath !== projectPath ||
        JSON.stringify(remediator.addressedFindings) !==
          JSON.stringify(expectedBaselineFailures)
      ) {
        throw new WorkflowExecutionError(
          'WORKFLOW_OUTPUT_SCHEMA_FAILED',
          'Remediator output did not identify the admitted Bun React project and exact RED findings.',
        );
      }

      const finalCommands = await validateBunReactCommands(projectPath);
      const finalAudit = await auditBunReactProject(
        projectPath,
        finalCommands,
        proofRoot,
      );
      const finalSnapshot = await snapshotBunReactTree(projectPath, proofRoot);
      const changedPaths = changedSourcePaths(beforeAudit, finalSnapshot);
      if (
        finalAudit.verdict !== 'GREEN' ||
        JSON.stringify(changedPaths) !==
          JSON.stringify(['src/App.jsx', 'src/App.test.jsx'])
      ) {
        throw new WorkflowExecutionError(
          'WORKFLOW_OUTPUT_SCHEMA_FAILED',
          'Remediation did not produce the exact bounded deterministic GREEN.',
        );
      }

      const reportBytes = renderReport({
        timestamp: input.utcTimestamp,
        projectPath,
        scaffoldProof,
        baseline,
        auditor,
        final: finalAudit,
        changedPaths,
        remediator,
      });
      const report = await artifact('CRA_RED_GREEN.md', {
        value: reportBytes,
        mediaType: 'text/markdown',
        publishPath: `.agent/testing/workflows/${input.utcTimestamp}/CRA_RED_GREEN.md`,
      });
      return {
        status: remediator.status,
        projectPath,
        scaffoldProof,
        baseline,
        auditor,
        final: finalAudit,
        changedPaths,
        report,
      };
    } finally {
      await cleanupBunReactResources(projectPath, proofRoot);
    }
  },
});

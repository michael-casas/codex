import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, relative, resolve } from 'node:path';

interface WorkflowArtifact {
  name: string;
  digest: string;
  mediaType: string;
  publishedPath: string;
}

interface CliPayload {
  ok: boolean;
  status: string;
  mode: string;
  journalPath: string;
  nodeCount: number;
  artifactCount: number;
  output: {
    status: string;
    projectPath: string;
    scaffoldProof: {
      schemaVersion: number;
      invocationCount: number;
      executable: string;
      argv: string[];
      environment: {
        NPM_CONFIG_USERCONFIG: string;
        NPM_CONFIG_CACHE: string;
      };
      cwd: string;
      startedAt: string;
      completedAt: string;
      exitCode: number;
      signal: string | null;
      tracePath: string;
      digest: string;
      attemptsPath: string;
      attemptsDigest: string;
      launcherDigest: string;
    };
    baseline: { verdict: string; treeDigest: string };
    auditor: { verdict: string; treeDigest: string };
    final: { verdict: string; treeDigest: string };
    changedPaths: string[];
    report: WorkflowArtifact;
  };
}

interface JournalNode {
  id: string;
  label: string;
  phase: string;
  dependencies: string[];
  model: string;
  reasoning: string;
  status: string;
  outcome: string;
  frozenAt: string;
  startedAt: string;
  completedAt: string;
  commandEvidence?: {
    schemaVersion: number;
    policyDigest: string;
    totalCompletedCommands: number;
    commandDigests: string[];
    rules: Array<{
      id: string;
      expectedCount: number;
      observedCount: number;
      passed: boolean;
    }>;
    digest: string;
  };
}

interface JournalDocument {
  status: string;
  nodes: JournalNode[];
  events: Array<{ sequence: number; type: string }>;
  artifacts: WorkflowArtifact[];
}

function utcTimestamp(now: Date): string {
  return now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

function sha256(bytes: string | Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function internalTypeScriptTemps(): string[] {
  return readdirSync(tmpdir())
    .filter((entry) => entry.startsWith('codex-workflows-ts-'))
    .sort();
}

function isolatedTmuxEnvironment(root: string): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { ...process.env, TMUX_TMPDIR: root };
  delete environment.TMUX;
  return environment;
}

function tmuxSessions(root: string): string[] {
  const result = spawnSync('tmux', ['list-sessions', '-F', '#{session_name}'], {
    encoding: 'utf8',
    env: isolatedTmuxEnvironment(root),
  });
  return result.status === 0
    ? result.stdout.trim().split('\n').filter(Boolean).sort()
    : [];
}

function processGroupExists(id: number): boolean {
  try {
    process.kill(-id, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForProcessGroupExit(id: number): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (!processGroupExists(id)) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
  }
}

function temporaryFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const found: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.name.endsWith('.tmp')) found.push(path);
    }
  };
  visit(root);
  return found.sort();
}

function workspaceDiffDigest(workspace: string, allowedPrefix: string): string {
  const listing = spawnSync(
    'git',
    ['ls-files', '-m', '--others', '--exclude-standard', '-z'],
    { cwd: workspace, encoding: 'utf8' },
  );
  assert.equal(listing.status, 0, listing.stderr);
  const paths = listing.stdout
    .split('\0')
    .filter((path) => path && !path.startsWith(allowedPrefix))
    .sort();
  const hash = createHash('sha256');
  for (const path of paths) {
    const absolute = resolve(workspace, path);
    const metadata = statSync(absolute);
    hash.update(`${path}\0${metadata.mode & 0o777}\0`);
    hash.update(readFileSync(absolute));
  }
  return `sha256:${hash.digest('hex')}`;
}

function workspaceRoot(): string {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return realpathSync(result.stdout.trim());
}

export class CraRedGreenDriver {
  readonly workspace = workspaceRoot();
  readonly source = resolve(
    this.workspace,
    'apps/codex-workflows/examples/cra-red-green.workflow.ts',
  );
  readonly timestamp = utcTimestamp(new Date());
  readonly relativeOutputRoot = `.agent/testing/workflows/${this.timestamp}`;
  readonly outputRoot = resolve(this.workspace, this.relativeOutputRoot);
  readonly reportPath = join(this.outputRoot, 'CRA_RED_GREEN.md');
  readonly projectPath = join(this.outputRoot, 'cra-proof-app');
  readonly stateRoot = join(this.outputRoot, 'run-state');
  readonly tmuxRoot = join(this.outputRoot, 'tmux');
  readonly inputPath = join(this.outputRoot, '.cra-red-green.input.json');
  readonly binDirectory = join(this.outputRoot, '.bin');
  private beforeTemps: string[] = [];
  private afterTemps: string[] = [];
  private beforeTmux: string[] = [];
  private afterTmux: string[] = [];
  private beforeDiffDigest = '';
  private afterDiffDigest = '';
  private processGroupId?: number;
  private payload?: CliPayload;
  private journal?: JournalDocument;
  private executionFailure?: unknown;

  prepare(): {
    exactShebang: boolean;
    executable: boolean;
    builtBinary: boolean;
  } {
    const bytes = readFileSync(this.source, 'utf8');
    const binary = resolve(this.workspace, 'apps/codex-workflows/dist/main.js');
    this.beforeTemps = internalTypeScriptTemps();
    this.beforeTmux = tmuxSessions(this.tmuxRoot);
    this.beforeDiffDigest = workspaceDiffDigest(
      this.workspace,
      `${this.relativeOutputRoot}/`,
    );
    return {
      exactShebang:
        bytes.split('\n', 1)[0] === '#!/usr/bin/env -S codex-workflows',
      executable: (statSync(this.source).mode & 0o111) !== 0,
      builtBinary: existsSync(binary),
    };
  }

  async execute(): Promise<void> {
    try {
      let stdout = '';
      let stderr = '';
      mkdirSync(this.binDirectory, { recursive: true, mode: 0o700 });
      mkdirSync(this.stateRoot, { recursive: true, mode: 0o700 });
      const binary = resolve(
        this.workspace,
        'apps/codex-workflows/dist/main.js',
      );
      chmodSync(binary, 0o755);
      symlinkSync(binary, join(this.binDirectory, 'codex-workflows'));
      writeFileSync(
        this.inputPath,
        `${JSON.stringify({ utcTimestamp: this.timestamp })}\n`,
        { mode: 0o600 },
      );
      const execution = await new Promise<{
        exitCode: number | null;
        signal: NodeJS.Signals | null;
      }>((resolveExit, rejectExecution) => {
        const child = spawn(
          this.source,
          ['--input', this.inputPath, '--json'],
          {
            cwd: this.workspace,
            detached: true,
            env: {
              ...isolatedTmuxEnvironment(this.tmuxRoot),
              PATH: `${this.binDirectory}${delimiter}${process.env.PATH ?? ''}`,
              CODEX_WORKFLOWS_HOME: this.stateRoot,
            },
            stdio: ['ignore', 'pipe', 'pipe'],
          },
        );
        assert.ok(child.pid);
        this.processGroupId = child.pid;
        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', (chunk: string) => {
          stdout += chunk;
        });
        child.stderr.on('data', (chunk: string) => {
          stderr += chunk;
        });
        const timeout = setTimeout(() => {
          if (child.pid && processGroupExists(child.pid)) {
            process.kill(-child.pid, 'SIGTERM');
          }
        }, 1_200_000);
        child.once('error', rejectExecution);
        child.once('close', (exitCode, signal) => {
          clearTimeout(timeout);
          resolveExit({ exitCode, signal });
        });
      });
      assert.equal(execution.signal, null, stderr);
      assert.equal(execution.exitCode, 0, stderr);
      this.payload = JSON.parse(stdout) as CliPayload;
      this.journal = JSON.parse(
        readFileSync(this.payload.journalPath, 'utf8'),
      ) as JournalDocument;
      assert.ok(this.processGroupId);
      await waitForProcessGroupExit(this.processGroupId);
      this.afterTemps = internalTypeScriptTemps();
      this.afterTmux = tmuxSessions(this.tmuxRoot);
      this.afterDiffDigest = workspaceDiffDigest(
        this.workspace,
        `${this.relativeOutputRoot}/`,
      );
    } catch (error) {
      this.executionFailure = error;
    } finally {
      rmSync(this.inputPath, { force: true });
      rmSync(this.binDirectory, { recursive: true, force: true });
    }
  }

  assertExecutionSucceeded(): void {
    assert.ifError(this.executionFailure);
  }

  assertTopology(): void {
    assert.ok(this.payload);
    assert.ok(this.journal);
    assert.equal(this.payload.ok, true);
    assert.equal(this.payload.status, 'completed');
    assert.equal(this.payload.mode, 'local-trusted-typescript');
    assert.equal(this.payload.nodeCount, 3);
    assert.equal(this.payload.artifactCount, 1);
    assert.deepEqual(
      this.journal.nodes.map((node) => node.label),
      ['cra-builder', 'cra-auditor', 'cra-remediator'],
    );
    assert.deepEqual(
      this.journal.nodes.map((node) => node.phase),
      ['implementation', 'audit', 'remediation'],
    );
    assert.ok(
      this.journal.nodes.every(
        (node) =>
          node.model === 'gpt-5.6-luna' &&
          node.reasoning === 'medium' &&
          node.status === 'completed' &&
          node.outcome === 'completed',
      ),
    );
    const [builder, auditor, remediator] = this.journal.nodes;
    assert.ok(builder && auditor && remediator);
    assert.deepEqual(builder.dependencies, []);
    assert.deepEqual(auditor.dependencies, [builder.id]);
    assert.deepEqual(remediator.dependencies, [builder.id, auditor.id].sort());
    assert.ok(Date.parse(auditor.startedAt) >= Date.parse(builder.completedAt));
    assert.ok(
      Date.parse(remediator.startedAt) >= Date.parse(auditor.completedAt),
    );
    assert.equal(builder.commandEvidence?.schemaVersion, 1);
    assert.match(
      builder.commandEvidence?.policyDigest ?? '',
      /^sha256:[a-f0-9]{64}$/,
    );
    assert.ok((builder.commandEvidence?.totalCompletedCommands ?? 0) >= 1);
    assert.equal(
      builder.commandEvidence?.commandDigests.length,
      builder.commandEvidence?.totalCompletedCommands,
    );
    assert.ok(
      builder.commandEvidence?.commandDigests.every((digest) =>
        /^sha256:[a-f0-9]{64}$/.test(digest),
      ),
    );
    assert.deepEqual(builder.commandEvidence?.rules, [
      {
        id: 'workflow-scaffold-launcher',
        expectedCount: 1,
        observedCount: 1,
        passed: true,
      },
      {
        id: 'direct-npx',
        expectedCount: 0,
        observedCount: 0,
        passed: true,
      },
      {
        id: 'direct-create-react-app',
        expectedCount: 0,
        observedCount: 0,
        passed: true,
      },
    ]);
    assert.match(
      builder.commandEvidence?.digest ?? '',
      /^sha256:[a-f0-9]{64}$/,
    );
  }

  assertRedAudit(): void {
    assert.ok(this.payload);
    const proof = this.payload.output.scaffoldProof;
    assert.equal(proof.schemaVersion, 1);
    assert.equal(proof.invocationCount, 1);
    assert.match(proof.executable, /\/npx$/);
    assert.deepEqual(proof.argv, [
      '--yes',
      'create-react-app@5.1.0',
      this.projectPath,
      '--use-npm',
    ]);
    assert.deepEqual(proof.environment, {
      NPM_CONFIG_USERCONFIG: '/dev/null',
      NPM_CONFIG_CACHE: join(this.outputRoot, 'npm-cache'),
    });
    assert.equal(proof.cwd, this.workspace);
    assert.equal(proof.exitCode, 0);
    assert.equal(proof.signal, null);
    assert.ok(Date.parse(proof.completedAt) >= Date.parse(proof.startedAt));
    const traceBytes = readFileSync(proof.tracePath, 'utf8');
    const trace = JSON.parse(traceBytes) as Record<string, unknown>;
    assert.equal(proof.digest, sha256(traceBytes));
    assert.deepEqual(trace.argv, proof.argv);
    assert.deepEqual(trace.environment, proof.environment);
    assert.equal(trace.cwd, proof.cwd);
    assert.equal(trace.invocationCount, 1);
    assert.equal(trace.exitCode, 0);
    assert.equal(trace.signal, null);
    const attemptsBytes = readFileSync(proof.attemptsPath, 'utf8');
    assert.equal(proof.attemptsDigest, sha256(attemptsBytes));
    assert.equal(attemptsBytes.trim().split('\n').filter(Boolean).length, 1);
    assert.match(proof.launcherDigest, /^sha256:[a-f0-9]{64}$/);
    assert.equal(this.payload.output.baseline.verdict, 'RED');
    assert.equal(this.payload.output.auditor.verdict, 'RED');
    assert.equal(
      this.payload.output.auditor.treeDigest,
      this.payload.output.baseline.treeDigest,
    );
  }

  assertGreenStop(): void {
    assert.ok(this.payload);
    assert.equal(this.payload.output.final.verdict, 'GREEN');
    assert.equal(this.payload.output.status, 'READY_FOR_EXTERNAL_AUDIT');
    assert.deepEqual(this.payload.output.changedPaths, [
      'src/App.js',
      'src/App.test.js',
    ]);
  }

  assertEvidenceAndResources(): void {
    assert.ok(this.payload);
    assert.ok(this.journal);
    assert.ok(this.processGroupId);
    const report = readFileSync(this.reportPath, 'utf8');
    assert.equal(this.payload.output.report.name, 'CRA_RED_GREEN.md');
    assert.equal(
      realpathSync(this.payload.output.report.publishedPath),
      realpathSync(this.reportPath),
    );
    assert.equal(this.payload.output.report.digest, sha256(report));
    assert.match(report, /Baseline verdict: RED/);
    assert.match(report, /Auditor verdict: RED/);
    assert.match(report, /Final verdict: GREEN/);
    assert.match(report, /READY_FOR_EXTERNAL_AUDIT/);
    assert.match(
      report,
      new RegExp(
        `Scaffold trace digest: ${this.payload.output.scaffoldProof.digest}`,
      ),
    );
    assert.match(report, /CRA_RED_GREEN_COMPLETE/);
    assert.equal(this.journal.events.at(-1)?.type, 'workflow.completed');
    assert.deepEqual(
      this.journal.events.map((event) => event.sequence),
      this.journal.events.map((_event, index) => index + 1),
    );
    assert.equal(processGroupExists(this.processGroupId), false);
    assert.deepEqual(
      this.afterTmux.filter((name) => !this.beforeTmux.includes(name)),
      [],
    );
    assert.deepEqual(
      this.afterTemps.filter((name) => !this.beforeTemps.includes(name)),
      [],
    );
    assert.deepEqual(temporaryFiles(this.outputRoot), []);
    assert.equal(existsSync(join(this.projectPath, 'node_modules')), false);
    assert.equal(existsSync(join(this.projectPath, 'build')), false);
    assert.equal(existsSync(join(this.projectPath, '.git')), false);
    assert.equal(
      existsSync(join(this.outputRoot, '.cra-scaffold-once.mjs')),
      false,
    );
    assert.equal(
      existsSync(join(this.outputRoot, '.cra-scaffold.lock')),
      false,
    );
    assert.equal(this.afterDiffDigest, this.beforeDiffDigest);
    assert.equal(
      relative(this.workspace, this.reportPath),
      `${this.relativeOutputRoot}/CRA_RED_GREEN.md`,
    );
  }
}

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';

interface ArtifactMetadata {
  name: string;
  path: string;
  digest: string;
  mediaType: string;
}

interface LaneOutput {
  lane: 'research' | 'audit';
  finding: string;
  evidence: string;
  inputNonce: string;
}

interface DecisionOutput {
  status: 'complete';
  schemaEnforced: true;
  researchFinding: string;
  auditFinding: string;
  researchNonce: string;
  auditNonce: string;
  summary: string;
}

interface CliPayload {
  ok: boolean;
  mode: string;
  status: string;
  runId: string;
  journalPath: string;
  nodeCount: number;
  artifactCount: number;
  output: {
    research: { research: LaneOutput; audit: LaneOutput };
    decision: DecisionOutput;
    artifact: ArtifactMetadata;
  };
}

interface JournalNode {
  id: string;
  label: string;
  dependencies: string[];
  model: string;
  reasoning: string;
  inputDigest: string;
  outputSchemaDigest?: string;
  outputDigest?: string;
  frozenAt: string;
  startedAt?: string;
  completedAt?: string;
  status: string;
  outcome?: string;
}

interface JournalDocument {
  schemaVersion: number;
  authority: string;
  runId: string;
  status: string;
  sourceDigest: string;
  inputDigest: string;
  nodes: JournalNode[];
  events: Array<{ sequence: number; type: string }>;
  artifacts: ArtifactMetadata[];
}

function sha256(bytes: string | Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function installedBinary(): string | undefined {
  for (const entry of (process.env.PATH ?? '').split(delimiter)) {
    const candidate = join(entry, 'codex-workflows');
    if (!existsSync(candidate)) continue;
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      continue;
    }
  }
  return undefined;
}

function internalTypeScriptTemps(): string[] {
  return readdirSync(tmpdir())
    .filter((entry) => entry.startsWith('codex-workflows-ts-'))
    .sort();
}

function temporaryFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const result: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.name.endsWith('.tmp')) result.push(path);
    }
  };
  visit(root);
  return result.sort();
}

function workspaceDiffDigest(workspace: string): string {
  const listing = spawnSync(
    'git',
    ['ls-files', '-m', '--others', '--exclude-standard', '-z'],
    { cwd: workspace, encoding: 'utf8' },
  );
  assert.equal(listing.status, 0, listing.stderr);
  const paths = listing.stdout.split('\0').filter(Boolean).sort();
  const digest = createHash('sha256');
  for (const path of paths) {
    const absolute = resolve(workspace, path);
    if (!existsSync(absolute)) {
      digest.update(`${path}\0deleted\0`);
      continue;
    }
    const metadata = statSync(absolute);
    digest.update(`${path}\0${metadata.mode & 0o777}\0`);
    digest.update(readFileSync(absolute));
  }
  return `sha256:${digest.digest('hex')}`;
}

function workspaceRoot(): string {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return realpathSync(result.stdout.trim());
}

function processGroupExists(processGroupId: number): boolean {
  try {
    process.kill(-processGroupId, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForProcessGroupExit(processGroupId: number): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (!processGroupExists(processGroupId)) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
  }
}

export class ExternalAuditDogfoodDriver {
  readonly workspace = workspaceRoot();
  readonly source = resolve(
    this.workspace,
    'apps/codex-workflows/examples/external-audit-attempt-3.workflow.ts',
  );
  readonly input = resolve(
    this.workspace,
    'apps/codex-workflows/examples/external-audit-attempt-3.input.json',
  );
  readonly stateRoot = resolve(
    this.workspace,
    'test-output/codex-workflows-external-audit-attempt-3/l3/workflow-state',
  );
  private beforeTemps: string[] = [];
  private beforeDiffDigest = '';
  private afterTemps: string[] = [];
  private afterDiffDigest = '';
  private processGroupId?: number;
  private payload?: CliPayload;
  private journal?: JournalDocument;

  prepare(): { sourceCount: number; installedWorkspaceBinary: boolean } {
    const sourceBytes = readFileSync(this.source, 'utf8');
    assert.equal(
      sourceBytes.split('\n', 1)[0],
      '#!/usr/bin/env -S codex-workflows',
    );
    const binary = installedBinary();
    assert.ok(binary, 'codex-workflows must resolve in PATH');
    assert.equal(
      realpathSync(binary),
      resolve(this.workspace, 'apps/codex-workflows/dist/main.js'),
    );
    assert.ok((statSync(this.source).mode & 0o111) !== 0);
    this.beforeTemps = internalTypeScriptTemps();
    this.beforeDiffDigest = workspaceDiffDigest(this.workspace);
    mkdirSync(this.stateRoot, { recursive: true, mode: 0o700 });
    return { sourceCount: 1, installedWorkspaceBinary: true };
  }

  async execute(): Promise<void> {
    assert.notEqual(this.beforeDiffDigest, '', 'prepare must run first');
    let stdout = '';
    let stderr = '';
    const execution = await new Promise<{
      exitCode: number | null;
      signal: NodeJS.Signals | null;
    }>((resolveExit, rejectExecution) => {
      const child = spawn(this.source, ['--input', this.input, '--json'], {
        cwd: this.workspace,
        detached: true,
        env: {
          ...process.env,
          CODEX_WORKFLOWS_HOME: this.stateRoot,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
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
      }, 540_000);
      child.once('error', rejectExecution);
      child.once('close', (exitCode, signal) => {
        clearTimeout(timeout);
        resolveExit({ exitCode, signal });
      });
    });

    assert.equal(execution.signal, null, stderr);
    assert.equal(execution.exitCode, 0, stderr);
    assert.notEqual(stdout.trim(), '', 'direct runner must emit final JSON');
    this.payload = JSON.parse(stdout) as CliPayload;
    assert.ok(this.payload.journalPath);
    this.journal = JSON.parse(
      readFileSync(this.payload.journalPath, 'utf8'),
    ) as JournalDocument;
    assert.ok(this.processGroupId);
    await waitForProcessGroupExit(this.processGroupId);
    this.afterTemps = internalTypeScriptTemps();
    this.afterDiffDigest = workspaceDiffDigest(this.workspace);
  }

  assertCompletedTopology(): {
    completedNodes: number;
    roots: number;
    joins: number;
  } {
    assert.ok(this.payload);
    assert.ok(this.journal);
    assert.equal(this.payload.ok, true);
    assert.equal(this.payload.mode, 'local-trusted-typescript');
    assert.equal(this.payload.status, 'completed');
    assert.equal(this.payload.nodeCount, 3);
    assert.equal(this.payload.artifactCount, 1);
    assert.equal(this.journal.schemaVersion, 1);
    assert.equal(this.journal.authority, 'local-operational-journal');
    assert.equal(this.journal.runId, this.payload.runId);
    assert.equal(this.journal.status, 'completed');
    assert.equal(this.journal.nodes.length, 3);
    assert.ok(
      this.journal.nodes.every(
        (node) =>
          node.status === 'completed' &&
          node.outcome === 'completed' &&
          node.model === 'gpt-5.6-luna' &&
          node.reasoning === 'medium',
      ),
    );
    const roots = this.journal.nodes.filter(
      (node) => node.dependencies.length === 0,
    );
    const joins = this.journal.nodes.filter(
      (node) => node.dependencies.length === 2,
    );
    assert.equal(roots.length, 2);
    assert.equal(joins.length, 1);
    const joinNode = joins[0];
    assert.ok(joinNode);
    assert.deepEqual(
      [...joinNode.dependencies].sort(),
      roots.map((node) => node.id).sort(),
    );
    const firstRootCompletion = Math.min(
      ...roots.map((node) => Date.parse(node.completedAt ?? '')),
    );
    assert.ok(
      roots.every(
        (node) => Date.parse(node.startedAt ?? '') < firstRootCompletion,
      ),
    );
    assert.ok(
      Date.parse(joinNode.frozenAt) >=
        Math.max(...roots.map((node) => Date.parse(node.completedAt ?? ''))),
    );
    assert.deepEqual(
      this.journal.events.map((event) => event.sequence),
      this.journal.events.map((_event, index) => index + 1),
    );
    assert.equal(this.journal.events.at(-1)?.type, 'workflow.completed');
    return { completedNodes: 3, roots: 2, joins: 1 };
  }

  assertTypedDataflowAndSchema(): {
    distinctDigests: number;
    schemaEnforced: boolean;
  } {
    assert.ok(this.payload);
    assert.ok(this.journal);
    const { research, decision } = this.payload.output;
    assert.equal(research.research.lane, 'research');
    assert.equal(research.audit.lane, 'audit');
    assert.equal(research.research.evidence, 'A3-RESEARCH-EVIDENCE');
    assert.equal(research.audit.evidence, 'A3-AUDIT-EVIDENCE');
    assert.equal(decision.researchFinding, research.research.finding);
    assert.equal(decision.auditFinding, research.audit.finding);
    assert.equal(decision.researchNonce, research.research.inputNonce);
    assert.equal(decision.auditNonce, research.audit.inputNonce);
    assert.equal(decision.status, 'complete');
    assert.equal(decision.schemaEnforced, true);
    const roots = this.journal.nodes.filter(
      (node) => node.dependencies.length === 0,
    );
    const join = this.journal.nodes.find(
      (node) => node.dependencies.length === 2,
    );
    assert.ok(join);
    assert.ok(join.outputSchemaDigest);
    assert.ok(roots.every((node) => node.outputSchemaDigest));
    const dataflowDigests = [
      ...roots.map((node) => node.inputDigest),
      ...roots.map((node) => node.outputDigest ?? ''),
      join.inputDigest,
    ];
    assert.ok(
      dataflowDigests.every((digest) => /^sha256:[a-f0-9]{64}$/.test(digest)),
    );
    assert.equal(new Set(dataflowDigests).size, 5);
    return { distinctDigests: 5, schemaEnforced: true };
  }

  assertArtifactAndCleanup(): {
    artifactDigestValid: boolean;
    processGroupDelta: number;
    temporaryResourceDelta: number;
    unauthorizedWorkspaceDiffDelta: number;
  } {
    assert.ok(this.payload);
    assert.ok(this.journal);
    assert.ok(this.processGroupId);
    const artifact = this.payload.output.artifact;
    assert.equal(artifact.name, 'external-audit-attempt-3-result.json');
    assert.equal(artifact.mediaType, 'application/json');
    assert.equal(this.journal.artifacts.length, 1);
    assert.deepEqual(this.journal.artifacts[0], artifact);
    const artifactBytes = readFileSync(artifact.path);
    assert.equal(sha256(artifactBytes), artifact.digest);
    assert.deepEqual(
      JSON.parse(artifactBytes.toString('utf8')),
      this.payload.output.decision,
    );
    assert.equal(processGroupExists(this.processGroupId), false);
    assert.deepEqual(this.afterTemps, this.beforeTemps);
    assert.deepEqual(temporaryFiles(this.stateRoot), []);
    assert.equal(this.afterDiffDigest, this.beforeDiffDigest);
    return {
      artifactDigestValid: true,
      processGroupDelta: 0,
      temporaryResourceDelta: 0,
      unauthorizedWorkspaceDiffDelta: 0,
    };
  }
}

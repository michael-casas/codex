import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { After, Before, Given, Then, When } from '@cucumber/cucumber';

import {
  createProcessPostgresFixture,
  type ProcessPostgresFixture,
  workspaceFile,
} from './support/postgres-fixture.js';

const cliPath = await workspaceFile('packages/process/src/cli.ts');

interface ProofWorld {
  candidateDigest?: string;
  candidateId?: string;
  directory?: string;
  fixture?: ProcessPostgresFixture;
  exitCode?: number;
  output?: Record<string, unknown>;
}

async function runCli(
  arguments_: readonly string[],
  environment: Record<string, string | undefined>,
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  const child = spawn('bun', [cliPath, ...arguments_], {
    env: { ...process.env, ...environment },
  });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
  child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
  const exitCode = await new Promise<number | null>((resolveExit, reject) => {
    child.once('error', reject);
    child.once('close', resolveExit);
  });
  return {
    exitCode,
    stdout: Buffer.concat(stdout).toString('utf8'),
    stderr: Buffer.concat(stderr).toString('utf8'),
  };
}

function jsonOutput(result: { stdout: string }): Record<string, unknown> {
  return result.stdout.trim() ? JSON.parse(result.stdout) as Record<string, unknown> : {};
}

async function registerCandidate(world: ProofWorld): Promise<string> {
  assert.ok(world.fixture);
  assert.ok(world.directory);
  assert.ok(world.candidateDigest);
  const manifest = resolve(world.directory, 'candidate-manifest.json');
  await writeFile(manifest, JSON.stringify({ algorithm: { name: 'l3-fixture-v1' }, paths: ['candidate'] }));
  const result = await runCli([
    'candidate', 'register',
    '--epoch', 'founder-recovery-l3',
    '--attempt', '1',
    '--workspace', process.cwd(),
    '--base', '1111111',
    '--head', '2222222',
    '--digest', world.candidateDigest,
    '--path-count', '1',
    '--manifest', manifest,
    '--idempotency-key', 'l3-candidate-1',
  ], { PROCESS_COORDINATOR_DATABASE_URL: world.fixture.coordinatorUrl });
  assert.equal(result.exitCode, 0, result.stderr);
  const candidateId = String(jsonOutput(result).candidateId);
  assert.match(candidateId, /^[a-f0-9-]{36}$/);
  world.candidateId = candidateId;
  return manifest;
}

Before(async function (this: ProofWorld) {
  this.fixture = await createProcessPostgresFixture();
  this.directory = await mkdtemp(`${tmpdir()}/codex-process-l3-`);
});

After(async function (this: ProofWorld) {
  if (this.directory) await rm(this.directory, { recursive: true, force: true });
  if (this.fixture) await this.fixture.close();
});

Given(
  'a new Founder recovery campaign and exact workflow candidate',
  function (this: ProofWorld) {
    this.candidateDigest = `sha256:${'b'.repeat(64)}`;
  },
);

When(
  'the coordinator registers the candidate and Preflight registers the complete immutable evidence bundle',
  async function (this: ProofWorld) {
    assert.ok(this.fixture);
    assert.ok(this.directory);
    const manifest = await registerCandidate(this);
    const artifacts = [
      { kind: 'candidate-manifest', path: manifest, role: 'coordinator', url: this.fixture.coordinatorUrl },
      { kind: 'gate-manifest', path: resolve(this.directory, 'gates.json'), role: 'preflight', url: this.fixture.preflightUrl },
      { kind: 'machine-tests', path: resolve(this.directory, 'tests.json'), role: 'preflight', url: this.fixture.preflightUrl },
      { kind: 'cleanup-proof', path: resolve(this.directory, 'cleanup.json'), role: 'preflight', url: this.fixture.preflightUrl },
      { kind: 'preflight-report', path: resolve(this.directory, 'preflight.json'), role: 'preflight', url: this.fixture.preflightUrl },
    ] as const;
    for (const artifact of artifacts.slice(1)) {
      await writeFile(artifact.path, JSON.stringify({ kind: artifact.kind, passed: true }));
    }
    for (const [index, artifact] of artifacts.entries()) {
      const result = await runCli([
        'artifact', 'register',
        '--candidate-id', this.candidateId ?? '',
        '--kind', artifact.kind,
        '--path', artifact.path,
        '--media-type', 'application/json',
        '--role', artifact.role,
        '--idempotency-key', `l3-artifact-${index + 1}`,
      ], artifact.role === 'coordinator'
        ? { PROCESS_COORDINATOR_DATABASE_URL: artifact.url }
        : { PROCESS_PREFLIGHT_DATABASE_URL: artifact.url });
      assert.equal(result.exitCode, 0, result.stderr);
    }
  },
);

When(
  'Preflight submits passing nonzero gates with zero unexpected resource delta',
  async function (this: ProofWorld) {
    assert.ok(this.fixture);
    assert.ok(this.directory);
    const evidencePath = resolve(this.directory, 'preflight-evidence.json');
    await writeFile(evidencePath, JSON.stringify({
      candidateDigest: this.candidateDigest,
      gates: [{ name: 'process-l3', exitCode: 0, selected: 2 }],
      nativeTests: 2,
      unexpectedResourceDelta: 0,
    }));
    const result = await runCli([
      'preflight', 'submit',
      '--candidate-id', this.candidateId ?? '',
      '--status', 'valid',
      '--evidence', evidencePath,
      '--idempotency-key', 'l3-preflight-1',
    ], { PROCESS_PREFLIGHT_DATABASE_URL: this.fixture.preflightUrl });
    this.exitCode = result.exitCode ?? undefined;
    this.output = jsonOutput(result);
    assert.equal(result.exitCode, 0, result.stderr);
  },
);

Then(
  'the scoped reader observes the reducer-approved judgment-ready projection',
  async function (this: ProofWorld) {
    assert.ok(this.fixture);
    const result = await runCli([
      'status', '--candidate-id', this.candidateId ?? '',
    ], { PROCESS_READER_DATABASE_URL: this.fixture.readerUrl });
    assert.equal(result.exitCode, 0, result.stderr);
    const output = jsonOutput(result);
    assert.equal(output.state, 'judgment_ready');
    assert.match(String(output.reducerDigest), /^sha256:[a-f0-9]{64}$/);
  },
);

When(
  'a worker attempts to submit an unregistered authored report as valid Preflight proof',
  async function (this: ProofWorld) {
    assert.ok(this.fixture);
    assert.ok(this.directory);
    await registerCandidate(this);
    const evidence = resolve(this.directory, 'forged-preflight.json');
    await writeFile(evidence, JSON.stringify({
      candidateDigest: this.candidateDigest,
      gates: [{ exitCode: 0, selected: 999 }],
      nativeTests: 999,
      unexpectedResourceDelta: 0,
    }));
    const result = await runCli([
      'preflight', 'submit',
      '--candidate-id', this.candidateId ?? '',
      '--status', 'valid',
      '--evidence', evidence,
      '--idempotency-key', 'l3-worker-forgery-1',
    ], { PROCESS_PREFLIGHT_DATABASE_URL: this.fixture.workerUrl });
    this.exitCode = result.exitCode ?? undefined;
  },
);

Then(
  'the scoped operation is rejected and the candidate remains not ready for judgment',
  async function (this: ProofWorld) {
    assert.ok(this.fixture);
    assert.notEqual(this.exitCode, 0);
    const result = await runCli([
      'status', '--candidate-id', this.candidateId ?? '',
    ], { PROCESS_READER_DATABASE_URL: this.fixture.readerUrl });
    assert.equal(result.exitCode, 0, result.stderr);
    assert.equal(jsonOutput(result).state, 'registered');
  },
);

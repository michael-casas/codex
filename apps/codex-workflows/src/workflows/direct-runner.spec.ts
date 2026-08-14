import { spawn, spawnSync, type SpawnSyncReturns } from 'node:child_process';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import {
  controlledInput,
  controlledWorkflowSource,
  type ControlledMode,
} from './support/controlled-source.js';

// === L2: REAL PROCESS / REAL CODEX SDK BOUNDARY TESTS ===

const workspace = resolve(import.meta.dirname, '../../../..');
const executable = resolve(workspace, 'apps/codex-workflows/dist/main.js');
const controlledCodex = fileURLToPath(
  new URL(
    '../../../../packages/codex/src/fixtures/controlled-codex.mjs',
    import.meta.url,
  ),
);

interface Fixture {
  root: string;
  source: string;
  input: string;
  trace: string;
  state: string;
}

async function fixture(mode: ControlledMode): Promise<Fixture> {
  await mkdir(resolve(workspace, 'tmp'), { recursive: true });
  const root = await mkdtemp(resolve(workspace, 'tmp/direct-runner-'));
  const source = join(root, 'controlled.workflow.ts');
  const input = join(root, `${mode}.input.json`);
  const trace = join(root, 'controlled-codex.jsonl');
  const state = join(root, 'state');
  await writeFile(source, controlledWorkflowSource());
  await writeFile(input, controlledInput(mode));
  await writeFile(trace, '');
  await chmod(source, 0o755);
  await chmod(controlledCodex, 0o755);
  return { root, source, input, trace, state };
}

function environment(item: Fixture): NodeJS.ProcessEnv {
  return {
    ...process.env,
    CODEX_WORKFLOWS_CODEX_PATH: controlledCodex,
    CODEX_WORKFLOWS_HOME: item.state,
    CODEX_TEST_TRACE: item.trace,
  };
}

function invoke(
  item: Fixture,
  args: string[],
  env: NodeJS.ProcessEnv = environment(item),
): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [executable, ...args], {
    cwd: workspace,
    encoding: 'utf8',
    env,
  });
}

function parse(source: string): Record<string, unknown> {
  return JSON.parse(source) as Record<string, unknown>;
}

async function trace(path: string): Promise<Record<string, unknown>[]> {
  const source = await readFile(path, 'utf8');
  return source
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForStarted(
  path: string,
  expectedCount = 1,
): Promise<number[]> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const pids = (await trace(path))
        .filter((entry) => entry.type === 'started')
        .map((entry) => entry.pid)
        .filter((pid): pid is number => typeof pid === 'number');
      if (pids.length >= expectedCount) return pids;
    } catch {
      // The controlled executable has not appended a complete record yet.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 20));
  }
  throw new Error('controlled Codex process did not start');
}

describe('[L2:INTEGRATION] direct TypeScript workflow runner', () => {
  test('[L2:INTEGRATION] TS-GC2-007 executes bare and explicit run forms with concurrent siblings, actual outputs, requested models/reasoning, redacted journal, and artifact', async () => {
    const item = await fixture('success');
    try {
      const bare = invoke(item, [item.source, '--input', item.input, '--json']);
      expect(bare.status).toBe(0);
      const barePayload = parse(bare.stdout);
      expect(barePayload).toEqual(
        expect.objectContaining({
          ok: true,
          command: 'run',
          mode: 'local-trusted-typescript',
          workflowId: 'controlled-direct-typescript',
          runId: expect.stringMatching(/^local-[a-z0-9-]+$/),
          status: 'completed',
          journalPath: expect.any(String),
          output: {
            research: {
              cqrs: 'cqrs-official-result',
              graphql: 'graphql-official-result',
            },
            proposal: 'decision-ready-resolver-factory-proposal',
            artifact: expect.objectContaining({
              name: 'controlled-proposal.md',
              path: expect.any(String),
              digest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
            }),
          },
        }),
      );

      const entries = await trace(item.trace);
      const started = entries.filter((entry) => entry.type === 'started');
      const completed = entries.filter((entry) => entry.type === 'completed');
      expect(started).toHaveLength(3);
      expect(completed).toHaveLength(3);
      const requests = started.map((entry) => ({
        input: String(entry.input),
        args: entry.args as string[],
        atMs: Number(entry.atMs),
        pid: Number(entry.pid),
      }));
      const cqrs = requests.find((request) =>
        request.input.includes('__CQRS__'),
      );
      const graphql = requests.find((request) =>
        request.input.includes('__GRAPHQL__'),
      );
      const consolidator = requests.find((request) =>
        request.input.includes('__CONSOLIDATE__'),
      );
      expect(cqrs?.args).toEqual(
        expect.arrayContaining([
          '--model',
          'gpt-5.6-terra',
          '--config',
          'model_reasoning_effort="medium"',
        ]),
      );
      expect(graphql?.args).toEqual(
        expect.arrayContaining([
          '--model',
          'gpt-5.6-sol',
          '--config',
          'model_reasoning_effort="medium"',
        ]),
      );
      expect(consolidator?.args).toEqual(
        expect.arrayContaining([
          '--model',
          'gpt-5.1-codex',
          '--config',
          'model_reasoning_effort="medium"',
        ]),
      );
      expect(consolidator?.input).toContain('cqrs-official-result');
      expect(consolidator?.input).toContain('graphql-official-result');
      const firstCompletion = Math.min(
        ...completed.map((entry) => Number(entry.atMs)),
      );
      expect(cqrs?.atMs).toBeLessThan(firstCompletion);
      expect(graphql?.atMs).toBeLessThan(firstCompletion);
      expect(consolidator?.atMs).toBeGreaterThanOrEqual(firstCompletion);

      const journalPath = String(barePayload.journalPath);
      const journalBytes = await readFile(journalPath, 'utf8');
      const journal = JSON.parse(journalBytes) as {
        authority?: string;
        status?: string;
        nodes?: Array<Record<string, unknown>>;
      };
      expect(journal.authority).toBe('local-operational-journal');
      expect(journal.status).toBe('completed');
      expect(journal.nodes).toHaveLength(3);
      expect(journalBytes).not.toContain('private cqrs prompt');
      expect(journalBytes).not.toContain('private graphql prompt');
      expect(journalBytes).not.toContain('private consolidator prompt');
      expect(journalBytes).not.toContain('sensitive-input-topic');
      expect(journalBytes).toContain('promptDigest');
      expect(journalBytes).toContain('inputDigest');
      const artifactPath = String(
        (barePayload.output as { artifact: { path: string } }).artifact.path,
      );
      expect(await readFile(artifactPath, 'utf8')).toBe(
        'decision-ready-resolver-factory-proposal',
      );

      await writeFile(item.trace, '');
      const explicit = invoke(item, [
        'run',
        item.source,
        '--input',
        item.input,
        '--json',
      ]);
      expect(explicit.status).toBe(0);
      expect(parse(explicit.stdout)).toEqual(
        expect.objectContaining({
          ok: true,
          command: 'run',
          mode: 'local-trusted-typescript',
          status: 'completed',
        }),
      );
    } finally {
      await rm(item.root, { force: true, recursive: true });
    }
  });

  test('[L2:INTEGRATION] TS-GC2-008 admits only trusted root-contained exact-shebang TypeScript and plans/dry-runs without SDK launch', async () => {
    const item = await fixture('success');
    try {
      for (const flag of ['--plan', '--dry-run']) {
        await writeFile(item.trace, '');
        const result = invoke(item, [
          item.source,
          flag,
          '--input',
          item.input,
          '--json',
        ]);
        expect(result.status).toBe(0);
        expect(parse(result.stdout)).toEqual(
          expect.objectContaining({
            ok: true,
            command: flag.slice(2),
            mode: 'local-trusted-typescript',
            trustedLocalCode: true,
            agentsLaunched: 0,
            dynamicNodeGraph: true,
          }),
        );
        expect(await trace(item.trace)).toEqual([]);
      }

      await writeFile(
        item.source,
        controlledWorkflowSource().replace(
          '#!/usr/bin/env -S codex-workflows',
          '#!/usr/bin/env node',
        ),
      );
      const wrongShebang = invoke(item, [item.source, '--json']);
      expect(wrongShebang.status).toBe(65);
      expect(parse(wrongShebang.stderr)).toEqual(
        expect.objectContaining({
          code: 'TYPESCRIPT_SHEBANG_INVALID',
          exitCode: 65,
        }),
      );

      await writeFile(item.source, controlledWorkflowSource());
      await writeFile(
        item.source,
        `${controlledWorkflowSource()}\nnot valid {`,
      );
      const invalidSource = invoke(item, [item.source, '--json']);
      expect(invalidSource.status).toBe(65);
      expect(parse(invalidSource.stderr)).toEqual(
        expect.objectContaining({
          code: 'TYPESCRIPT_SOURCE_INVALID',
          exitCode: 65,
        }),
      );
      expect(await trace(item.trace)).toEqual([]);
    } finally {
      await rm(item.root, { force: true, recursive: true });
    }
  });

  test('[L2:INTEGRATION] TS-GC2-009 maps real agent and schema failures deterministically, aborts siblings, and reaps SDK children', async () => {
    const failure = await fixture('failure');
    try {
      const failed = invoke(failure, [
        failure.source,
        '--input',
        failure.input,
        '--json',
      ]);
      expect(failed.status).toBe(67);
      const failedPayload = parse(failed.stderr);
      expect(failedPayload).toEqual(
        expect.objectContaining({
          ok: false,
          code: 'WORKFLOW_AGENT_FAILED',
          exitCode: 67,
          details: expect.objectContaining({
            runId: expect.any(String),
            journalPath: expect.any(String),
          }),
        }),
      );
      expect(failed.stderr).not.toContain('controlled raw failure detail');
      const failureTrace = await trace(failure.trace);
      expect(
        failureTrace.some(
          (entry) =>
            entry.type === 'started' &&
            String(entry.input).includes('__QUEUED__'),
        ),
      ).toBe(false);
      expect(failureTrace.some((entry) => entry.type === 'terminated')).toBe(
        true,
      );
      const failurePids = failureTrace
        .map((entry) => entry.pid)
        .filter((pid): pid is number => typeof pid === 'number');
      expect(failurePids.every((pid) => !processExists(pid))).toBe(true);
      const failedJournal = await readFile(
        String((failedPayload.details as { journalPath: string }).journalPath),
        'utf8',
      );
      expect(failedJournal).toContain('"status": "failed"');
      expect(failedJournal).not.toContain('controlled raw failure detail');
    } finally {
      await rm(failure.root, { force: true, recursive: true });
    }

    const schema = await fixture('schema');
    try {
      const invalid = invoke(schema, [
        schema.source,
        '--input',
        schema.input,
        '--json',
      ]);
      expect(invalid.status).toBe(68);
      expect(parse(invalid.stderr)).toEqual(
        expect.objectContaining({
          code: 'WORKFLOW_OUTPUT_SCHEMA_FAILED',
          exitCode: 68,
        }),
      );
      const schemaTrace = await trace(schema.trace);
      expect(
        schemaTrace.filter((entry) => entry.type === 'started'),
      ).toHaveLength(1);
      expect(
        schemaTrace
          .map((entry) => entry.pid)
          .filter((pid): pid is number => typeof pid === 'number')
          .every((pid) => !processExists(pid)),
      ).toBe(true);
    } finally {
      await rm(schema.root, { force: true, recursive: true });
    }
  });

  test('[L2:INTEGRATION] DF-GC1-006 rejects host-incompatible structured-output schemas before launch and preserves response-validation exit 68', async () => {
    const item = await fixture('schema');
    const hostInvalidSource = join(item.root, 'host-invalid.workflow.ts');
    try {
      await writeFile(
        hostInvalidSource,
        `#!/usr/bin/env -S codex-workflows
import { agent, defineWorkflow } from '@codex/workflows';

export default defineWorkflow({
  id: 'host-invalid-schema-admission',
  run: () => agent({
    label: 'must-not-launch',
    model: 'gpt-5.6-luna',
    reasoning: 'medium',
    prompt: '__HOST_INVALID_SCHEMA__',
    outputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['accepted'],
      properties: { accepted: { const: true } }
    }
  })
});
`,
      );
      await chmod(hostInvalidSource, 0o755);
      const admission = invoke(item, [hostInvalidSource, '--json']);
      expect(admission.status).toBe(65);
      expect(parse(admission.stderr)).toEqual(
        expect.objectContaining({
          code: 'WORKFLOW_DEFINITION_INVALID',
          exitCode: 65,
        }),
      );
      expect(await trace(item.trace)).toEqual([]);

      await writeFile(item.trace, '');
      const malformedResponse = invoke(item, [
        item.source,
        '--input',
        item.input,
        '--json',
      ]);
      expect(malformedResponse.status).toBe(68);
      expect(parse(malformedResponse.stderr)).toEqual(
        expect.objectContaining({
          code: 'WORKFLOW_OUTPUT_SCHEMA_FAILED',
          exitCode: 68,
        }),
      );
    } finally {
      await rm(item.root, { force: true, recursive: true });
    }
  });

  test('[L2:INTEGRATION] DF-GC1-007 returns only after children, journal events, artifacts, SDK host, and temporary files are terminally quiet', async () => {
    const item = await fixture('failure');
    try {
      const result = invoke(item, [
        item.source,
        '--input',
        item.input,
        '--json',
      ]);
      expect(result.status).toBe(67);
      const payload = parse(result.stderr);
      const journalPath = String(
        (payload.details as { journalPath?: string } | undefined)?.journalPath,
      );
      const journal = JSON.parse(await readFile(journalPath, 'utf8')) as {
        status: string;
        nodes: Array<{ outcome?: string }>;
        events: Array<{ type?: string }>;
      };
      expect(journal.status).toBe('failed');
      expect(journal.nodes).toHaveLength(3);
      expect(
        journal.nodes.every((node) =>
          ['failed', 'cancelled'].includes(node.outcome ?? ''),
        ),
      ).toBe(true);
      expect(journal.events.at(-1)?.type).toBe('workflow.failed');
      expect(
        journal.events.filter((event) => event.type === 'workflow.failed'),
      ).toHaveLength(1);
      const entries = await trace(item.trace);
      expect(
        entries
          .map((entry) => entry.pid)
          .filter((pid): pid is number => typeof pid === 'number')
          .every((pid) => !processExists(pid)),
      ).toBe(true);
      expect(
        (await readdir(item.state, { recursive: true })).some((name) =>
          String(name).endsWith('.tmp'),
        ),
      ).toBe(false);
    } finally {
      await rm(item.root, { force: true, recursive: true });
    }
  });

  test('[L2:INTEGRATION] DF-GC1-007 classifies a public artifact failure as exit 70 and leaves no child or temporary residue', async () => {
    const item = await fixture('success');
    try {
      await writeFile(
        item.source,
        `#!/usr/bin/env -S codex-workflows
import { artifact, defineWorkflow } from '@codex/workflows';

export default defineWorkflow({
  id: 'controlled-artifact-failure',
  run: () => artifact('../forbidden.md', 'must not publish')
});
`,
      );
      await chmod(item.source, 0o755);
      const result = invoke(item, [item.source, '--json']);
      expect(result.status).toBe(70);
      expect(parse(result.stderr)).toEqual(
        expect.objectContaining({
          code: 'WORKFLOW_ARTIFACT_FAILED',
          exitCode: 70,
          details: expect.objectContaining({
            storageCode: 'ARTIFACT_NAME_INVALID',
            journalPath: expect.any(String),
          }),
        }),
      );
      expect(await trace(item.trace)).toEqual([]);
      expect(
        (await readdir(item.state, { recursive: true })).some((name) =>
          String(name).endsWith('.tmp'),
        ),
      ).toBe(false);
    } finally {
      await rm(item.root, { force: true, recursive: true });
    }
  });

  test('[L2:INTEGRATION] DF-GC1-008 proves cancellation cleanup with deterministic started-process readiness rather than wall-clock hope', async () => {
    const item = await fixture('cancel');
    try {
      await writeFile(
        item.source,
        controlledWorkflowSource().replace(
          `return agent({
        label: 'controlled-cancel',
        model: 'gpt-5.6-luna',
        reasoning: 'medium',
        prompt: '__HANG__ private cancellation prompt',
        input
      });`,
          `return parallel([
        () => agent({
          label: 'controlled-cancel-one',
          model: 'gpt-5.6-luna',
          reasoning: 'medium',
          prompt: '__HANG__ private cancellation prompt one',
          input
        }),
        () => agent({
          label: 'controlled-cancel-two',
          model: 'gpt-5.6-luna',
          reasoning: 'medium',
          prompt: '__HANG__ private cancellation prompt two',
          input
        }),
        () => agent({
          label: 'controlled-never-started',
          model: 'gpt-5.6-luna',
          reasoning: 'medium',
          prompt: '__QUEUED__ private queued prompt',
          input
        })
      ]);`,
        ),
      );
      const child = spawn(
        process.execPath,
        [executable, item.source, '--input', item.input, '--json'],
        {
          cwd: workspace,
          env: environment(item),
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      let stderr = '';
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk: string) => {
        stderr += chunk;
      });
      const startedPids = await waitForStarted(item.trace, 2);
      expect(startedPids).toHaveLength(2);
      child.kill('SIGINT');
      const exitCode = await new Promise<number | null>((resolveExit) => {
        child.once('exit', (code) => resolveExit(code));
      });
      expect(exitCode).toBe(130);
      const payload = parse(stderr);
      const entries = await trace(item.trace);
      expect(
        entries.filter(
          (entry) =>
            entry.type === 'started' &&
            String(entry.input).includes('__QUEUED__'),
        ),
      ).toHaveLength(0);
      expect(
        entries.filter((entry) => entry.type === 'terminated'),
      ).toHaveLength(2);
      expect(startedPids.every((pid) => !processExists(pid))).toBe(true);
      const journal = JSON.parse(
        await readFile(
          String(
            (payload.details as { journalPath?: string } | undefined)
              ?.journalPath,
          ),
          'utf8',
        ),
      ) as { events: Array<{ type?: string }> };
      expect(journal.events.at(-1)?.type).toBe('workflow.cancelled');
    } finally {
      await rm(item.root, { force: true, recursive: true });
    }
  });

  test('[L2:INTEGRATION] TS-GC2-010 converts SIGINT to cancellation, atomically journals it, and guarantees SDK host cleanup', async () => {
    const item = await fixture('cancel');
    try {
      const child = spawn(
        process.execPath,
        [executable, item.source, '--input', item.input, '--json'],
        {
          cwd: workspace,
          env: environment(item),
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk: string) => {
        stderr += chunk;
      });
      const startedPids = await waitForStarted(item.trace);
      child.kill('SIGINT');
      const exitCode = await new Promise<number | null>((resolveExit) => {
        child.once('exit', (code) => resolveExit(code));
      });
      expect(exitCode).toBe(130);
      expect(stdout).toBe('');
      const payload = parse(stderr);
      expect(payload).toEqual(
        expect.objectContaining({
          code: 'WORKFLOW_CANCELLED',
          exitCode: 130,
          details: expect.objectContaining({ journalPath: expect.any(String) }),
        }),
      );
      for (let attempt = 0; attempt < 50; attempt += 1) {
        if (startedPids.every((pid) => !processExists(pid))) break;
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 20));
      }
      expect(startedPids.every((pid) => !processExists(pid))).toBe(true);
      const journal = await readFile(
        String((payload.details as { journalPath: string }).journalPath),
        'utf8',
      );
      expect(journal).toContain('"status": "cancelled"');
      expect(journal).not.toContain('private cancellation prompt');
    } finally {
      await rm(item.root, { force: true, recursive: true });
    }
  });
});

describe('[L2:E2E] executable shebang interpreter', () => {
  test('[L2:E2E] TS-GC2-011 runs the exact env -S codex-workflows shebang through a PATH-resolved executable', async () => {
    const item = await fixture('success');
    try {
      const bin = join(item.root, 'bin');
      await mkdir(bin);
      await chmod(executable, 0o755);
      await symlink(executable, join(bin, 'codex-workflows'));
      const result = spawnSync(item.source, ['--input', item.input, '--json'], {
        cwd: workspace,
        encoding: 'utf8',
        env: {
          ...environment(item),
          PATH: `${bin}:${process.env.PATH ?? '/usr/bin:/bin'}`,
        },
      });
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      expect(parse(result.stdout)).toEqual(
        expect.objectContaining({
          ok: true,
          command: 'run',
          mode: 'local-trusted-typescript',
          status: 'completed',
        }),
      );
    } finally {
      await rm(item.root, { force: true, recursive: true });
    }
  });
});

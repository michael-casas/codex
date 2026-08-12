import { spawnSync } from 'node:child_process';
import {
  access,
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

const workspace = resolve(import.meta.dirname, '../../../../..');
const publicExecutable = resolve(
  workspace,
  'apps/codex-workflows/dist/main.js',
);
const canonicalWorkflow = resolve(
  workspace,
  'apps/codex-workflows/examples/cra-red-green.workflow.ts',
);
const canonicalContract = resolve(
  workspace,
  'apps/codex-workflows/src/features/cra-red-green/support/contract.ts',
);
const controlledCodex = fileURLToPath(
  new URL('./support/controlled-codex.mjs', import.meta.url),
);
const controlledNpx = fileURLToPath(
  new URL('./support/controlled-npx.mjs', import.meta.url),
);

async function readTrace(path: string): Promise<Record<string, unknown>[]> {
  return (await readFile(path, 'utf8'))
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

// === L2: END-TO-END TESTS ===
describe('[L2:E2E] CRA RED to GREEN public workflow', () => {
  test('[L2:E2E] CRA-RG-GC1-002 executes the exact controlled builder audit remediator chain', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-cra-red-green-e2e-'));
    try {
      const bin = join(root, 'bin');
      const state = join(root, 'state');
      const source = join(
        root,
        'apps/codex-workflows/examples/cra-red-green.workflow.ts',
      );
      const contract = join(
        root,
        'apps/codex-workflows/src/features/cra-red-green/support/contract.ts',
      );
      const input = join(root, 'cra-red-green.input.json');
      const tracePath = join(root, 'controlled-codex.jsonl');
      await mkdir(bin);
      await mkdir(dirname(source), { recursive: true });
      await mkdir(dirname(contract), { recursive: true });
      await cp(canonicalWorkflow, source);
      await cp(canonicalContract, contract);
      await writeFile(
        input,
        `${JSON.stringify({ utcTimestamp: '20260810T224500Z' })}\n`,
      );
      await writeFile(tracePath, '');
      await chmod(publicExecutable, 0o755);
      await chmod(controlledCodex, 0o755);
      await chmod(controlledNpx, 0o755);
      await chmod(source, 0o755);
      await symlink(publicExecutable, join(bin, 'codex-workflows'));
      await symlink(controlledNpx, join(bin, 'npx'));

      const result = spawnSync(source, ['--input', input, '--json'], {
        cwd: root,
        encoding: 'utf8',
        timeout: 120_000,
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH ?? '/usr/bin:/bin'}`,
          CODEX_WORKFLOWS_CODEX_PATH: controlledCodex,
          CODEX_WORKFLOWS_HOME: state,
          CODEX_CRA_RED_GREEN_TEST_TRACE: tracePath,
        },
      });
      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        journalPath: string;
        nodeCount: number;
        artifactCount: number;
        output: {
          status: string;
          projectPath: string;
          scaffoldProof: {
            schemaVersion: 1;
            invocationCount: number;
            executable: string;
            argv: string[];
            environment: {
              NPM_CONFIG_USERCONFIG: string;
              NPM_CONFIG_CACHE: string;
            };
            cwd: string;
            exitCode: number;
            signal: null;
            tracePath: string;
            digest: string;
          };
          baseline: { verdict: string; treeDigest: string };
          auditor: { verdict: string; treeDigest: string };
          final: { verdict: string; treeDigest: string };
          changedPaths: string[];
          report: { publishedPath: string; digest: string };
        };
      };
      expect(payload.nodeCount).toBe(3);
      expect(payload.artifactCount).toBe(1);
      expect(payload.output).toEqual(
        expect.objectContaining({
          status: 'READY_FOR_EXTERNAL_AUDIT',
          changedPaths: ['src/App.js', 'src/App.test.js'],
          baseline: expect.objectContaining({ verdict: 'RED' }),
          auditor: expect.objectContaining({ verdict: 'RED' }),
          final: expect.objectContaining({ verdict: 'GREEN' }),
        }),
      );
      expect(payload.output.auditor.treeDigest).toBe(
        payload.output.baseline.treeDigest,
      );

      const expectedWorkspace = await realpath(root);
      const expectedProofRoot = join(
        expectedWorkspace,
        '.agent/testing/workflows/20260810T224500Z',
      );
      expect(payload.output.scaffoldProof).toEqual(
        expect.objectContaining({
          schemaVersion: 1,
          invocationCount: 1,
          argv: [
            '--yes',
            'create-react-app@5.1.0',
            join(expectedProofRoot, 'cra-proof-app'),
            '--use-npm',
          ],
          environment: {
            NPM_CONFIG_USERCONFIG: '/dev/null',
            NPM_CONFIG_CACHE: join(expectedProofRoot, 'npm-cache'),
          },
          cwd: expectedWorkspace,
          exitCode: 0,
          signal: null,
          tracePath: join(expectedProofRoot, 'CRA_SCAFFOLD_TRACE.json'),
        }),
      );
      expect(payload.output.scaffoldProof.executable).toMatch(/\/npx$/);
      expect(payload.output.scaffoldProof.digest).toMatch(
        /^sha256:[a-f0-9]{64}$/,
      );
      const scaffoldTrace = JSON.parse(
        await readFile(payload.output.scaffoldProof.tracePath, 'utf8'),
      ) as Record<string, unknown>;
      expect(scaffoldTrace).toEqual(
        expect.objectContaining({
          schemaVersion: 1,
          invocationCount: 1,
          argv: payload.output.scaffoldProof.argv,
          environment: payload.output.scaffoldProof.environment,
          cwd: expectedWorkspace,
          exitCode: 0,
          signal: null,
        }),
      );

      const trace = await readTrace(tracePath);
      const started = trace.filter((entry) => entry.type === 'started');
      expect(started.map((entry) => entry.stage)).toEqual([
        'builder',
        'auditor',
        'remediator',
      ]);
      expect(
        started.every((entry) =>
          JSON.stringify(entry.args).includes('gpt-5.6-luna'),
        ),
      ).toBe(true);
      expect(
        started.every((entry) =>
          JSON.stringify(entry.args).includes(
            'model_reasoning_effort=\\"medium\\"',
          ),
        ),
      ).toBe(true);

      const journal = JSON.parse(
        await readFile(payload.journalPath, 'utf8'),
      ) as {
        status: string;
        nodes: Array<{
          id: string;
          label: string;
          phase: string;
          dependencies: string[];
          model: string;
          reasoning: string;
          status: string;
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
        }>;
        events: Array<{ type: string; phase?: string }>;
        artifacts: Array<{ digest: string; publishedPath?: string }>;
      };
      expect(journal.status).toBe('completed');
      expect(journal.nodes.map((node) => node.label)).toEqual([
        'cra-builder',
        'cra-auditor',
        'cra-remediator',
      ]);
      expect(journal.nodes.map((node) => node.phase)).toEqual([
        'implementation',
        'audit',
        'remediation',
      ]);
      expect(journal.nodes[0]?.dependencies).toEqual([]);
      expect(journal.nodes[1]?.dependencies).toEqual([journal.nodes[0]?.id]);
      expect(journal.nodes[2]?.dependencies).toEqual(
        [journal.nodes[0]?.id, journal.nodes[1]?.id].sort(),
      );
      expect(
        journal.nodes.every(
          (node) =>
            node.model === 'gpt-5.6-luna' &&
            node.reasoning === 'medium' &&
            node.status === 'completed',
        ),
      ).toBe(true);
      expect(journal.nodes[0]?.commandEvidence).toEqual(
        expect.objectContaining({
          schemaVersion: 1,
          policyDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
          totalCompletedCommands: 1,
          commandDigests: [expect.stringMatching(/^sha256:[a-f0-9]{64}$/)],
          rules: [
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
          ],
          digest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        }),
      );
      expect(JSON.stringify(journal)).not.toContain(
        payload.output.scaffoldProof.executable,
      );
      expect(journal.events.at(-1)?.type).toBe('workflow.completed');
      expect(journal.artifacts).toEqual([
        expect.objectContaining({ digest: payload.output.report.digest }),
      ]);

      const report = await readFile(
        payload.output.report.publishedPath,
        'utf8',
      );
      expect(report).toContain('Baseline verdict: RED');
      expect(report).toContain('Auditor verdict: RED');
      expect(report).toContain('Final verdict: GREEN');
      expect(report).toContain('READY_FOR_EXTERNAL_AUDIT');
      expect(report).toContain(
        `Scaffold trace digest: ${payload.output.scaffoldProof.digest}`,
      );
      expect(report).not.toContain('Scaffold executable:');
      expect(report).not.toContain('Scaffold argv:');
      expect(report).not.toContain('Scaffold npm user config:');
      expect(report).not.toContain('Scaffold npm cache:');
      expect(report).not.toContain(payload.output.scaffoldProof.executable);
      expect(report).not.toContain('create-react-app');
      expect(report).not.toContain('npx');
      await expect(
        access(join(payload.output.projectPath, 'node_modules')),
      ).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('[L2:E2E] CRA-RG-GC1-003 cleans all material scaffold resources when the builder provider fails after mutation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-cra-red-green-fail-'));
    try {
      const bin = join(root, 'bin');
      const state = join(root, 'state');
      const source = join(
        root,
        'apps/codex-workflows/examples/cra-red-green.workflow.ts',
      );
      const contract = join(
        root,
        'apps/codex-workflows/src/features/cra-red-green/support/contract.ts',
      );
      const timestamp = '20260810T224501Z';
      const proofRoot = join(root, `.agent/testing/workflows/${timestamp}`);
      const projectPath = join(proofRoot, 'cra-proof-app');
      const input = join(root, 'cra-red-green.input.json');
      const tracePath = join(root, 'controlled-codex.jsonl');
      await mkdir(bin);
      await mkdir(dirname(source), { recursive: true });
      await mkdir(dirname(contract), { recursive: true });
      await cp(canonicalWorkflow, source);
      await cp(canonicalContract, contract);
      await writeFile(
        input,
        `${JSON.stringify({ utcTimestamp: timestamp })}\n`,
      );
      await writeFile(tracePath, '');
      await chmod(publicExecutable, 0o755);
      await chmod(controlledCodex, 0o755);
      await chmod(controlledNpx, 0o755);
      await chmod(source, 0o755);
      await symlink(publicExecutable, join(bin, 'codex-workflows'));
      await symlink(controlledNpx, join(bin, 'npx'));

      const result = spawnSync(source, ['--input', input, '--json'], {
        cwd: root,
        encoding: 'utf8',
        timeout: 120_000,
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH ?? '/usr/bin:/bin'}`,
          CODEX_WORKFLOWS_CODEX_PATH: controlledCodex,
          CODEX_WORKFLOWS_HOME: state,
          CODEX_CRA_RED_GREEN_TEST_TRACE: tracePath,
          CODEX_CRA_RED_GREEN_FAIL_STAGE: 'builder',
        },
      });
      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(67);
      const failure = JSON.parse(result.stderr) as {
        code: string;
        details: { journalPath: string };
      };
      expect(failure.code).toBe('WORKFLOW_AGENT_FAILED');
      const journal = JSON.parse(
        await readFile(failure.details.journalPath, 'utf8'),
      ) as {
        status: string;
        nodes: Array<{ label: string; status: string; outcome: string }>;
      };
      expect(journal.status).toBe('failed');
      expect(journal.nodes).toEqual([
        expect.objectContaining({
          label: 'cra-builder',
          status: 'failed',
          outcome: 'failed',
        }),
      ]);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_200));
      await expect(access(join(projectPath, 'node_modules'))).rejects.toThrow();
      await expect(access(join(projectPath, 'build'))).rejects.toThrow();
      await expect(access(join(projectPath, '.git'))).rejects.toThrow();
      await expect(access(join(proofRoot, 'npm-cache'))).rejects.toThrow();
      await expect(
        access(join(proofRoot, 'CRA_RED_GREEN.md')),
      ).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('[L2:E2E] CRA-RG-GC1-004 rejects a builder transcript containing a second direct scaffold command', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-cra-red-green-policy-'));
    try {
      const bin = join(root, 'bin');
      const state = join(root, 'state');
      const source = join(
        root,
        'apps/codex-workflows/examples/cra-red-green.workflow.ts',
      );
      const contract = join(
        root,
        'apps/codex-workflows/src/features/cra-red-green/support/contract.ts',
      );
      const timestamp = '20260810T224502Z';
      const input = join(root, 'cra-red-green.input.json');
      const tracePath = join(root, 'controlled-codex.jsonl');
      await mkdir(bin);
      await mkdir(dirname(source), { recursive: true });
      await mkdir(dirname(contract), { recursive: true });
      await cp(canonicalWorkflow, source);
      await cp(canonicalContract, contract);
      await writeFile(
        input,
        `${JSON.stringify({ utcTimestamp: timestamp })}\n`,
      );
      await writeFile(tracePath, '');
      await chmod(publicExecutable, 0o755);
      await chmod(controlledCodex, 0o755);
      await chmod(controlledNpx, 0o755);
      await chmod(source, 0o755);
      await symlink(publicExecutable, join(bin, 'codex-workflows'));
      await symlink(controlledNpx, join(bin, 'npx'));

      const result = spawnSync(source, ['--input', input, '--json'], {
        cwd: root,
        encoding: 'utf8',
        timeout: 120_000,
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH ?? '/usr/bin:/bin'}`,
          CODEX_WORKFLOWS_CODEX_PATH: controlledCodex,
          CODEX_WORKFLOWS_HOME: state,
          CODEX_CRA_RED_GREEN_TEST_TRACE: tracePath,
          CODEX_CRA_RED_GREEN_EXTRA_SCAFFOLD: 'true',
        },
      });
      expect(result.error).toBeUndefined();
      expect(result.status, result.stdout).toBe(67);
      const failure = JSON.parse(result.stderr) as {
        code: string;
        details: { journalPath: string };
      };
      expect(failure.code).toBe('WORKFLOW_AGENT_FAILED');
      const journal = JSON.parse(
        await readFile(failure.details.journalPath, 'utf8'),
      ) as {
        status: string;
        nodes: Array<{ label: string; status: string; outcome: string }>;
      };
      expect(journal.status).toBe('failed');
      expect(journal.nodes).toEqual([
        expect.objectContaining({
          label: 'cra-builder',
          status: 'failed',
          outcome: 'failed',
        }),
      ]);
      expect(JSON.stringify(journal)).not.toContain('create-react-app@5.1.0');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

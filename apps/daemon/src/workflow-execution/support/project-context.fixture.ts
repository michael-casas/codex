import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createControlHttpServer } from '@codex/control-gateway';
import {
  createProductionControlRuntime,
  type ProductionControlConfig,
} from '../../control-runtime.js';

const exec = promisify(execFile);
export async function projectContextFixture() {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), 'cas-project-context-')),
  );
  const runtimeProfile = {
    model: 'gpt-5.6-luna',
    reasoningEffort: 'low',
    sandbox: 'readOnly',
    approvalPolicy: 'never',
  } as const;
  const projects: Array<{
    repositoryId: string;
    checkoutPath: string;
    sourceRoot: string;
    baseRevision: string;
  }> = [];
  const token = 'project-context-fixture-token-'.repeat(3);
  const servers: Array<ReturnType<typeof createControlHttpServer>> = [];
  const runtimes: Array<
    Awaited<ReturnType<typeof createProductionControlRuntime>>
  > = [];
  try {
    for (const repositoryId of ['canonical', 'external-one', 'external-two']) {
      const checkoutPath = join(root, repositoryId);
      const sourceRoot = join(checkoutPath, '.agent/workflows');
      await mkdir(sourceRoot, { recursive: true });
      await exec('git', ['init', '--quiet', checkoutPath]);
      await writeFile(join(checkoutPath, 'identity.txt'), repositoryId);
      await exec('git', ['-C', checkoutPath, 'add', 'identity.txt']);
      await exec('git', [
        '-C',
        checkoutPath,
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.invalid',
        'commit',
        '--quiet',
        '--allow-empty',
        '-m',
        'chore: initialize fixture',
      ]);
      const { stdout } = await exec('git', [
        '-C',
        checkoutPath,
        'rev-parse',
        'HEAD',
      ]);
      projects.push({
        repositoryId,
        checkoutPath,
        sourceRoot,
        baseRevision: stdout.trim(),
      });
      await writeFile(
        join(sourceRoot, 'probe.workflow.ts'),
        `import {writeFileSync} from 'node:fs';\nimport {defineWorkflow} from '@codex/workflows';\nwriteFileSync(${JSON.stringify(join(checkoutPath, 'selected'))}, typeof defineWorkflow);\nexport default {};\n`,
      );
    }
    await mkdir(join(root, 'ui'));
    await writeFile(join(root, 'token'), token, { mode: 0o600 });
    const canonical = projects[0];
    const config = {
      hosts: [
        {
          hostId: 'local',
          transport: 'local-proxy',
          expectedVersion: '0.151.0',
        },
      ],
      repositories: [
        { ...canonical, hostId: 'local', leaseRoot: join(root, 'leases') },
      ],
      workflows: [],
      workflowSources: [
        {
          actorAgentId: 'owner',
          hostId: 'local',
          repositoryId: canonical.repositoryId,
          assignmentId: 'task',
          baseRevision: canonical.baseRevision,
          sourceRoot: canonical.sourceRoot,
          runtimeProfile,
        },
      ],
      localProjectPolicies: [
        {
          actorAgentId: 'owner',
          hostId: 'local',
          allowedRoots: [root],
          leaseRoot: join(root, 'leases'),
          registryRoot: join(root, 'registry'),
          runtimeProfile,
        },
      ],
      viewer: {
        host: '127.0.0.1',
        port: 0,
        tokenFile: join(root, 'token'),
        uiDirectory: join(root, 'ui'),
      },
    } as unknown as ProductionControlConfig;
    async function connect(actorAgentId = 'owner') {
      // Admission and rejected source compilation must never reach persistence or an agent.
      const runtime = await createProductionControlRuntime(
        'postgresql://127.0.0.1:1/forbidden',
        'postgresql://127.0.0.1:1/forbidden',
        config,
      );
      runtimes.push(runtime);
      const server = createControlHttpServer({
        control: runtime.control,
        authorization: {
          actorAgentId,
          scopes: ['control:workflow', 'control:delegate', 'control:project'],
        },
        token,
        uiDirectory: join(root, 'ui'),
        port: 0,
      });
      servers.push(server);
      const { origin } = await server.start();
      return {
        origin,
        runtime,
        async call(operation: string, command: unknown) {
          const response = await fetch(`${origin}/api/control/${operation}`, {
            method: 'POST',
            headers: {
              authorization: `Bearer ${token}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify(command),
          });
          return {
            status: response.status,
            body: (await response.json()) as Record<string, unknown>,
          };
        },
      };
    }
    return {
      root,
      projects,
      config,
      token,
      connect,
      command(index: number) {
        return {
          ...projects[index],
          hostId: 'local',
          assignmentId: 'task',
          admissionIntent: 'admit-local-project',
        };
      },
      async close() {
        for (const server of servers.reverse()) await server.stop();
        for (const runtime of runtimes.reverse())
          await runtime.hosts.disable('local');
        await rm(root, { recursive: true, force: true });
      },
    };
  } catch (error) {
    for (const server of servers.reverse()) await server.stop();
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

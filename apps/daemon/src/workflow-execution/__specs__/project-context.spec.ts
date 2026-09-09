import { access, readFile, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { projectContextFixture } from '../support/project-context.fixture.js';
import { createLocalProjectAdmission } from '../local-project-admission.js';

// === L2: REAL-BOUNDARY INTEGRATION TESTS ===
describe('[L2:INTEGRATION] admitted local project contexts', () => {
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  });
  async function fixture() {
    const value = await projectContextFixture();
    cleanups.push(value.close);
    return value;
  }

  it.each([
    ['network granted', 'workspaceWrite', 'workspaceWrite', true, true],
    ['network default', 'workspaceWrite', 'workspaceWrite', undefined, true],
    ['network opt-out', 'workspaceWrite', 'workspaceWrite', false, true],
    ['sandbox escalation', 'workspaceWrite', 'dangerFullAccess', false, false],
    ['sandbox alias escalation', 'readOnly', 'workspace-write', false, false],
    ['unknown sandbox', 'workspaceWrite', 'unknown', false, false],
  ] as const)(
    'PC-REVIEW-POLICY enforces %s',
    async (_label, ceiling, sandbox, networkAccess, allowed) => {
      const f = await fixture();
      const policy = f.config.localProjectPolicies![0];
      const admission = await createLocalProjectAdmission({
        policies: [
          {
            ...policy,
            runtimeProfile: {
              ...policy.runtimeProfile,
              sandbox: ceiling,
            },
          },
        ],
        hosts: f.config.hosts,
        repositories: f.config.repositories,
        workflowSources: f.config.workflowSources!,
      });
      const actor = {
        actorAgentId: 'owner',
        scopes: ['control:project', 'control:delegate'],
      };
      await admission.admitProject(f.command(1), actor);
      const result = admission.authorizeCommand(
        {
          hostId: 'local',
          idempotencyKey: 'policy-check',
          workspace: {
            repositoryId: f.projects[1].repositoryId,
            baseRevision: f.projects[1].baseRevision,
          },
          runtimeProfile: {
            model: 'gpt-5.6-luna',
            reasoningEffort: 'low',
            approvalPolicy: 'never',
            sandbox,
            ...(networkAccess === undefined ? {} : { networkAccess }),
          },
        },
        actor,
      );
      if (allowed)
        await expect(result).resolves.toHaveProperty('idempotencyKey');
      else
        await expect(result).rejects.toMatchObject({
          code: 'PROJECT_ADMISSION_UNAUTHORIZED',
        });
    },
  );

  it('PC-L2-COEXIST admits two external Git projects and selects each source without canonical contamination', async () => {
    const f = await fixture();
    const client = await f.connect();
    for (const index of [1, 2]) {
      const result = await client.call('admitProject', f.command(index));
      expect(result, 'explicit first-use admission').toMatchObject({
        status: 200,
        body: { repositoryId: f.projects[index].repositoryId, hostId: 'local' },
      });
    }
    for (const project of f.projects) {
      const result = await client.call('runWorkflow', {
        source: 'probe.workflow.ts',
        repositoryId: project.repositoryId,
        hostId: 'local',
        idempotencyKey: 'same-key',
      });
      expect(result.body).toMatchObject({ code: 'WORKFLOW_EXPORT_INVALID' });
      expect(
        await readFile(join(project.checkoutPath, 'selected'), 'utf8'),
      ).toBe('function');
    }
    await expect(access(join(f.root, 'leases'))).resolves.toBeUndefined();
  });

  it('PC-L2-RESTART retains admitted identity and rejects conflicting rebinding across runtime reconstruction', async () => {
    const f = await fixture();
    const first = await f.connect();
    expect((await first.call('admitProject', f.command(1))).status).toBe(200);
    const second = await f.connect();
    expect((await second.call('admitProject', f.command(1))).status).toBe(200);
    const conflict = await second.call('admitProject', {
      ...f.command(2),
      repositoryId: f.projects[1].repositoryId,
    });
    expect(conflict.body).toMatchObject({ code: 'PROJECT_IDENTITY_CONFLICT' });
    const source = await second.call('runWorkflow', {
      source: 'probe.workflow.ts',
      repositoryId: f.projects[1].repositoryId,
      idempotencyKey: 'retry',
    });
    expect(source.body).toMatchObject({ code: 'WORKFLOW_EXPORT_INVALID' });
    await expect(
      access(join(f.projects[2].checkoutPath, 'selected')),
    ).rejects.toThrow();
  });

  it('PC-L2-DIRECT resolves admitted external repositories through the real direct-handoff workspace lease service', async () => {
    const f = await fixture();
    const client = await f.connect();
    for (const index of [1, 2]) {
      expect((await client.call('admitProject', f.command(index))).status).toBe(
        200,
      );
      const project = f.projects[index];
      const lease = await client.runtime.workspaces
        .acquire({
          hostId: 'local',
          repositoryId: project.repositoryId,
          baseRevision: project.baseRevision,
          assignmentId: `direct-${index}`,
        })
        .catch(async (error: unknown) => {
          const host = await client.runtime.hosts.connect('local');
          const probe = await host.request<{
            exitCode: number;
            stdout: string;
            stderr: string;
          }>('command/exec', {
            command: [
              'git',
              '-C',
              project.checkoutPath,
              'rev-parse',
              '--show-toplevel',
              'HEAD',
              `${project.baseRevision}^{commit}`,
            ],
            cwd: project.checkoutPath,
            timeoutMs: 5000,
            sandboxPolicy: { type: 'readOnly', networkAccess: false },
          });
          // Fixture diagnostics expose classifications, never paths or raw stderr.
          console.error('PC-L2-DIRECT diagnostic', {
            exitCode: probe.exitCode,
            revisionMatches:
              probe.stdout.trim().split('\n')[2] === project.baseRevision,
            sandboxDenied:
              /bwrap|namespace|Operation not permitted|Permission denied/i.test(
                probe.stderr,
              ),
            unsafeOwnership: /dubious ownership|safe.directory/i.test(
              probe.stderr,
            ),
            notRepository: /not a git repository/i.test(probe.stderr),
          });
          throw error;
        });
      try {
        const workspace = await client.runtime.workspaces.resolve(
          lease.workspaceRef,
        );
        expect(
          await readFile(join(workspace.cwd, 'identity.txt'), 'utf8'),
        ).toBe(project.repositoryId);
        expect(workspace.cwd).not.toBe(project.checkoutPath);
        await expect(
          access(join(workspace.cwd, '.agent/workflows/probe.workflow.ts')),
        ).rejects.toThrow();
      } finally {
        await client.runtime.workspaces.release(lease.workspaceRef);
      }
    }
  }, 30_000);

  it('PC-L2-DIRECT-ACTOR prevents another actor from delegating into an admitted project before persistence or launch', async () => {
    const f = await fixture();
    const owner = await f.connect();
    expect((await owner.call('admitProject', f.command(1))).status).toBe(200);
    const stranger = await f.connect('stranger');
    const project = f.projects[1];
    const result = await stranger.call('delegateAgent', {
      idempotencyKey: 'direct',
      assignmentRef: 'task',
      assignmentDigest: `sha256:${'a'.repeat(64)}`,
      hostId: 'local',
      workspace: {
        repositoryId: project.repositoryId,
        assignmentId: 'task',
        baseRevision: project.baseRevision,
      },
      runtimeProfile: {
        model: 'gpt-5.6-luna',
        reasoningEffort: 'low',
        sandbox: 'readOnly',
        approvalPolicy: 'never',
      },
      completionBoundary: 'ready-for-audit',
      prompt: 'Must never execute',
    });
    expect(result.body).toEqual({ code: 'PROJECT_ADMISSION_UNAUTHORIZED' });
  });

  it.each([
    ['actor', 'PROJECT_ADMISSION_UNAUTHORIZED'],
    ['host', 'PROJECT_ADMISSION_UNAUTHORIZED'],
    ['intent', 'PROJECT_ADMISSION_INVALID'],
    ['revision', 'PROJECT_REVISION_INVALID'],
    ['source', 'PROJECT_SOURCE_OUTSIDE_ROOT'],
    ['symlink', 'PROJECT_SOURCE_OUTSIDE_ROOT'],
    ['checkout', 'PROJECT_ROOT_UNAUTHORIZED'],
    ['git', 'PROJECT_REPOSITORY_INVALID'],
    ['missing-source', 'PROJECT_SOURCE_MISSING'],
  ])(
    'PC-L2-BOUNDARY rejects %s before source execution',
    async (kind, code) => {
      const f = await fixture();
      const client = await f.connect(kind === 'actor' ? 'stranger' : 'owner');
      const command = { ...f.command(1) };
      if (kind === 'host') command.hostId = 'remote';
      if (kind === 'intent') command.admissionIntent = 'path-exists';
      if (kind === 'revision') command.baseRevision = 'f'.repeat(40);
      if (kind === 'source') command.sourceRoot = f.projects[2].sourceRoot;
      if (kind === 'symlink') {
        command.sourceRoot = join(f.projects[1].checkoutPath, 'escape');
        await symlink(f.projects[2].sourceRoot, command.sourceRoot);
      }
      if (kind === 'checkout') command.checkoutPath = join(f.root, '..');
      if (kind === 'git') command.checkoutPath = f.projects[1].sourceRoot;
      if (kind === 'missing-source')
        command.sourceRoot = join(f.projects[1].checkoutPath, 'missing');
      const result = await client.call('admitProject', command);
      expect(result.body).toEqual({ code });
      expect(JSON.stringify(result.body)).not.toContain(f.root);
      for (const project of f.projects)
        await expect(
          access(join(project.checkoutPath, 'selected')),
        ).rejects.toThrow();
    },
  );

  it('PC-L2-DIAGNOSTICS preserves single-context calls and rejects ambiguous, wrong and missing sources without private paths', async () => {
    const f = await fixture();
    const client = await f.connect();
    const command = {
      source: 'missing.workflow.ts',
      idempotencyKey: 'diagnostic',
    };
    expect(
      (
        await client.call('runWorkflow', {
          ...command,
          source: 'probe.workflow.ts',
        })
      ).body,
    ).toMatchObject({ code: 'WORKFLOW_EXPORT_INVALID' });
    expect((await client.call('runWorkflow', command)).body).toEqual({
      code: 'WORKFLOW_SOURCE_NOT_FOUND',
    });
    expect((await client.call('admitProject', f.command(1))).status).toBe(200);
    expect((await client.call('runWorkflow', command)).body).toEqual({
      code: 'WORKFLOW_CONTEXT_AMBIGUOUS',
    });
    expect(
      (
        await client.call('runWorkflow', {
          ...command,
          repositoryId: 'unadmitted',
        })
      ).body,
    ).toEqual({ code: 'WORKFLOW_CONTEXT_MISSING' });
    expect(
      (
        await client.call('runWorkflow', {
          ...command,
          repositoryId: 'external-one',
          hostId: 'remote',
        })
      ).body,
    ).toEqual({ code: 'WORKFLOW_CONTEXT_MISSING' });
  });
});

import { describe, expect, it, vi } from 'vitest';
import * as workflows from '../../../../index.js';

const context = {
  sourceRoot: '/approved',
  artifactDirectory: '/approved/.agent/workflow-modules',
  hostId: 'local',
  workspace: {
    repositoryId: 'repo',
    baseRevision: 'a'.repeat(40),
    assignmentId: 'approved',
  },
  runtimeProfile: {
    model: 'gpt-5.6-luna',
    reasoningEffort: 'high',
    sandbox: 'workspaceWrite',
    approvalPolicy: 'never',
  },
} as const;

function setup() {
  const resolveContext = vi.fn(
    async (): Promise<workflows.WorkflowSourceContext> => context,
  );
  const compileSource = vi.fn(async () => ({
    workflowRef: `source.${'b'.repeat(64)}`,
    sourceDigest: `sha256:${'b'.repeat(64)}` as const,
  }));
  const submit = vi.fn(async (command: unknown) => ({
    runId: 'durable-run',
    command,
  }));
  const factory = Reflect.get(workflows, 'createWorkflowSourceSubmission');
  expect(factory, 'public source admission capability').toBeTypeOf('function');
  return {
    run: factory({ resolveContext, compileSource, submit }) as (
      command: unknown,
      authorization: unknown,
    ) => Promise<unknown>,
    resolveContext,
    compileSource,
    submit,
  };
}

// === L1: UNIT TESTS ===
describe('[L1:UNIT] trusted workflow source admission', () => {
  it('PC-L1-SELECT carries an explicit repository selector to actor-bound context resolution', async () => {
    const { run, resolveContext, submit } = setup();
    await run(
      {
        source: 'example.workflow.ts',
        repositoryId: 'repo',
        hostId: 'local',
        idempotencyKey: 'project-request',
      },
      { actorAgentId: 'owner', scopes: ['control:workflow'] },
    );
    expect(resolveContext).toHaveBeenCalledWith('owner', 'local', 'repo');
    expect(submit).toHaveBeenCalledOnce();
  });

  it('PC-L1-WRONG rejects a resolver returning another repository before compilation', async () => {
    const { run, compileSource, submit } = setup();
    await expect(
      run(
        {
          source: 'example.workflow.ts',
          repositoryId: 'other',
          idempotencyKey: 'project-request',
        },
        { actorAgentId: 'owner', scopes: ['control:workflow'] },
      ),
    ).rejects.toMatchObject({ code: 'WORKFLOW_CONTEXT_INVALID' });
    expect(compileSource).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it('PC-L1-KEY isolates explicitly selected projects while preserving retry identity', async () => {
    const { run, resolveContext, submit } = setup();
    const authorization = {
      actorAgentId: 'owner',
      scopes: ['control:workflow'],
    };
    const command = {
      source: 'example.workflow.ts',
      repositoryId: 'repo',
      idempotencyKey: 'same-key',
    };
    await run(command, authorization);
    await run(command, authorization);
    resolveContext.mockResolvedValueOnce({
      ...context,
      workspace: { ...context.workspace, repositoryId: 'second' },
    });
    await run({ ...command, repositoryId: 'second' }, authorization);
    const commands = submit.mock.calls.map(
      ([value]) => value as workflows.RunWorkflowCommand,
    );
    expect(commands).toHaveLength(3);
    expect(commands[0].idempotencyKey).toBe(commands[1].idempotencyKey);
    expect(commands[0].idempotencyKey).not.toBe(commands[2].idempotencyKey);
    expect(workflows.prepareWorkflowRun(commands[0]).runId).not.toBe(
      workflows.prepareWorkflowRun(commands[2]).runId,
    );
  });

  it('WA-L1-ENVELOPE composes one existing durable command from actor context', async () => {
    const { run, resolveContext, compileSource, submit } = setup();
    const authorization = {
      actorAgentId: 'owner',
      scopes: ['control:workflow'],
    };
    await expect(
      run(
        {
          source: 'example.workflow.ts',
          input: { topic: 'demo' },
          idempotencyKey: 'request-1',
        },
        authorization,
      ),
    ).resolves.toMatchObject({ runId: 'durable-run' });
    expect(resolveContext).toHaveBeenCalledWith('owner', undefined);
    expect(compileSource).toHaveBeenCalledWith('example.workflow.ts', context);
    expect(submit).toHaveBeenCalledExactlyOnceWith({
      workflowRef: `source.${'b'.repeat(64)}`,
      sourceDigest: `sha256:${'b'.repeat(64)}`,
      input: { topic: 'demo' },
      hostId: 'local',
      workspace: context.workspace,
      runtimeProfile: context.runtimeProfile,
      idempotencyKey: 'request-1',
    });
  });

  it('WA-L1-ADMISSION rejects invalid input and missing scope before source access', async () => {
    const { run, resolveContext, compileSource, submit } = setup();
    const valid = {
      source: 'example.workflow.ts',
      input: {},
      idempotencyKey: 'request-1',
    };
    for (const command of [
      { ...valid, sourceDigest: 'forged' },
      { ...valid, source: '' },
      { ...valid, idempotencyKey: '' },
      { ...valid, input: 1n },
    ]) {
      await expect(
        run(command, { actorAgentId: 'owner', scopes: ['control:workflow'] }),
      ).rejects.toThrow();
    }
    await expect(
      run(valid, { actorAgentId: 'owner', scopes: [] }),
    ).rejects.toThrow();
    expect(resolveContext).not.toHaveBeenCalled();
    expect(compileSource).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it('WA-L1-ADMISSION fails unknown or ambiguous context before compilation', async () => {
    const { run, resolveContext, compileSource, submit } = setup();
    resolveContext.mockRejectedValueOnce(
      new Error('WORKFLOW_CONTEXT_AMBIGUOUS'),
    );
    await expect(
      run(
        { source: 'example.workflow.ts', idempotencyKey: 'request-1' },
        { actorAgentId: 'owner', scopes: ['control:workflow'] },
      ),
    ).rejects.toThrow('WORKFLOW_CONTEXT_AMBIGUOUS');
    expect(compileSource).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });
});

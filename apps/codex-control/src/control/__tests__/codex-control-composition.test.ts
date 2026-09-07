import { describe, expect, it, vi } from 'vitest';

import { createCodexControlPlane } from '../codex-control.module.js';

describe('[L1:INTEGRATION] codex-control accepted seam composition', () => {
  it('submits one workflow command through the package-owned durable client', async () => {
    const execute = vi.fn(async () => ({
      commandId: 'command',
      cursor: '2',
      replayed: false,
    }));
    const control = createCodexControlPlane({
      delegation: {
        delegateAgent: async () => ({}),
        cancelAgent: async () => ({}),
      },
      messaging: {
        send: async () => ({
          messageId: 'm',
          correlationId: 'c',
          state: 'queued',
        }),
        ask: async () => ({
          messageId: 'm',
          correlationId: 'c',
          state: 'queued',
        }),
        reply: async () => ({
          messageId: 'm',
          correlationId: 'c',
          state: 'queued',
        }),
      },
      visibility: { snapshot: async () => ({}), wait: async () => ({}) },
      workflowStore: { execute, events: async () => [] },
    });

    const handle = await control.runWorkflow(
      {
        workflowRef: 'trusted.workflow',
        sourceDigest: `sha256:${'a'.repeat(64)}`,
        input: { topic: 'mcp' },
        hostId: 'local',
        workspace: {
          repositoryId: 'codex',
          baseRevision: 'b'.repeat(40),
          assignmentId: 'CAS-09',
        },
        runtimeProfile: {
          model: 'gpt-5.6-sol',
          reasoningEffort: 'medium',
          sandbox: 'workspaceWrite',
          approvalPolicy: 'never',
        },
        idempotencyKey: 'cas-09-workflow',
      },
      { actorAgentId: 'agent-a', scopes: ['control:workflow'] },
    );

    expect(execute).toHaveBeenCalledTimes(1);
    expect(handle).toMatchObject({ state: 'accepted', cursor: '2' });
  });
});

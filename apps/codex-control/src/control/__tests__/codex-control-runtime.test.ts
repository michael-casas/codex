import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';

import {
  createCodexControlServer,
  type CodexControlPlane,
} from '../codex-control.gateway.js';

const control: CodexControlPlane = {
  delegateAgent: async () => ({
    delegationId: 'delegation-1',
    executionId: 'execution-1',
    agentId: 'agent-1',
    hostId: 'local',
    threadId: 'thread-1',
  }),
  sendAgentMessage: async () => ({}),
  runWorkflow: async () => ({
    runId: `workflow_${'a'.repeat(64)}`,
    state: 'accepted',
    cursor: '2',
  }),
  cancelAgent: async () => ({}),
  cancelWorkflow: async () => ({}),
  snapshot: async () => ({ cursor: '0', changed: false }),
  wait: async () => ({ cursor: '0', changed: false }),
};

describe('[L1:INTEGRATION] CAS-09.R2 presented MCP results', () => {
  it('RP-MCP requires explicit workflow effort and forwards it unchanged', async () => {
    const seen: unknown[] = [];
    const server = createCodexControlServer({
      control: {
        ...control,
        runWorkflow: async (command) => {
          seen.push(command);
          return { runId: 'profile-run' };
        },
      },
      authorize: () => ({
        actorAgentId: 'owner',
        scopes: ['control:workflow'],
      }),
    });
    const client = new Client({ name: 'runtime-profile', version: '1' });
    const [a, b] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(b);
      await client.connect(a);
      const args = {
        workflowRef: 'demo',
        sourceDigest: `sha256:${'a'.repeat(64)}`,
        input: {},
        hostId: 'local',
        repositoryId: 'codex',
        baseRevision: 'b'.repeat(40),
        assignmentId: 'CAS-RP-01',
        model: 'gpt-5.6-luna',
        sandbox: 'workspaceWrite',
        idempotencyKey: 'profile',
      };
      const response = await client.callTool({
        name: 'run_workflow',
        arguments: { ...args, reasoningEffort: 'high' },
      });
      expect(response.isError).not.toBe(true);
      expect(seen).toEqual([
        expect.objectContaining({
          runtimeProfile: expect.objectContaining({
            model: 'gpt-5.6-luna',
            reasoningEffort: 'high',
          }),
        }),
      ]);
      const missing = await client.callTool({
        name: 'run_workflow',
        arguments: args,
      });
      expect(missing.isError).toBe(true);
      expect(seen).toHaveLength(1);
    } finally {
      await client.close();
      await server.close();
    }
  });
  it('rejects non-loopback and credential-bearing presentation origins', () => {
    for (const browserBaseUrl of [
      'https://control.example.test',
      'http://token:secret@127.0.0.1:4765',
      'http://0.0.0.0:4765',
    ]) {
      expect(() =>
        createCodexControlServer({
          control,
          authorize: () => ({ actorAgentId: 'agent-owner', scopes: [] }),
          browserBaseUrl,
        }),
      ).toThrow('Control presentation origin is invalid.');
    }
  });

  it('returns one stable agent handle with one complete loopback browser URL', async () => {
    const server = createCodexControlServer({
      control,
      authorize: () => ({
        actorAgentId: 'agent-owner',
        scopes: ['control:delegate', 'control:workflow'],
      }),
      browserBaseUrl: 'http://127.0.0.1:4765',
    } as never);
    const client = new Client({ name: 'cas-09-r2-l1', version: '1.0.0' });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const response = await client.callTool({
        name: 'delegate_agent',
        arguments: {
          idempotencyKey: 'delegate-1',
          assignmentRef: 'CAS-09.R2',
          assignmentDigest: `sha256:${'a'.repeat(64)}`,
          hostId: 'local',
          repositoryId: 'codex',
          baseRevision: 'b'.repeat(40),
          assignmentId: 'CAS-09.R2',
          model: 'gpt-5.6-sol',
          reasoningEffort: 'medium',
          sandbox: 'workspaceWrite',
          approvalPolicy: 'never',
          completionBoundary: 'ready-for-audit',
          prompt: 'Execute the assignment.',
        },
      });

      expect(response.structuredContent).toMatchObject({
        agentId: 'agent-1',
        presentation: {
          browserUrl: 'http://127.0.0.1:4765/agents/agent-1',
        },
      });
      expect(JSON.stringify(response)).not.toMatch(
        /credential|secret|token|wss:\/\//i,
      );

      const workflow = await client.callTool({
        name: 'run_workflow',
        arguments: {
          workflowRef: 'trusted.workflow',
          sourceDigest: `sha256:${'a'.repeat(64)}`,
          input: {},
          hostId: 'local',
          repositoryId: 'codex',
          baseRevision: 'b'.repeat(40),
          assignmentId: 'CAS-09.R2',
          model: 'gpt-5.6-sol',
          sandbox: 'workspaceWrite',
          reasoningEffort: 'medium',
          idempotencyKey: 'workflow-1',
        },
      });
      expect(workflow.structuredContent).toMatchObject({
        runId: `workflow_${'a'.repeat(64)}`,
        presentation: {
          browserUrl: `http://127.0.0.1:4765/workflows/workflow_${'a'.repeat(64)}`,
        },
      });
    } finally {
      await client.close();
      await server.close();
    }
  });
});

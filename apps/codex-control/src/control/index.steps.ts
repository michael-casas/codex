import { After, Given, Then, When } from '@cucumber/cucumber';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { strict as assert } from 'node:assert';
import { createCodexControlServer } from './codex-control.gateway.js';
import { createCodexControlPlane } from './codex-control.module.js';

type World = {
  client?: Client;
  server?: ReturnType<typeof createCodexControlServer>;
  result?: unknown;
  error?: unknown;
  calls?: unknown[];
  continuation?: unknown;
};

const adoptedThreadId = 'thread-herdr-existing-1';

Given('a codex-control MCP connection', async function (this: World) {
  this.server = createCodexControlServer({
    control: createCodexControlPlane({
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
      visibility: {
        snapshot: async () => ({
          cursor: '0',
          changed: false,
          feed: { state: 'collapsed' },
        }),
        wait: async () => ({
          cursor: '0',
          changed: false,
          feed: { state: 'collapsed' },
        }),
      },
      workflowStore: {
        execute: async () => ({
          commandId: 'unused',
          cursor: '0',
          replayed: false,
        }),
        events: async () => [],
      },
    }),
    authorize: () => ({ actorAgentId: 'cas-09-l3', scopes: ['control:read'] }),
  });
  this.client = new Client({ name: 'cas-09-l3', version: '1.0.0' });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await this.server.connect(serverTransport);
  await this.client.connect(clientTransport);
});

Given(
  'a codex-control MCP connection with an adoptable existing thread',
  async function (this: World) {
    this.calls = [];
    this.server = createCodexControlServer({
      control: createCodexControlPlane({
        delegation: {
          delegateAgent: async (command) => {
            this.calls?.push(command);
            return {
              agentId: 'delegation-adopted-1',
              delegationId: 'delegation-adopted-1',
              threadId: adoptedThreadId,
              ownership: 'adopted',
              state: 'running',
            };
          },
          continueAgent: async (command) => {
            this.calls?.push(command);
            return {
              agentId: 'delegation-adopted-1',
              delegationId: 'delegation-adopted-1',
              threadId: adoptedThreadId,
              ownership: 'adopted',
              state: 'running',
            };
          },
          cancelAgent: async () => ({}),
        },
        messaging: {
          send: async () => ({ messageId: 'm', correlationId: 'c', state: 'queued' }),
          ask: async () => ({ messageId: 'm', correlationId: 'c', state: 'queued' }),
          reply: async () => ({ messageId: 'm', correlationId: 'c', state: 'queued' }),
        },
        visibility: {
          snapshot: async () => ({ cursor: '0', changed: false, feed: { state: 'collapsed' } }),
          wait: async () => ({ cursor: '0', changed: false, feed: { state: 'collapsed' } }),
        },
        workflowStore: {
          execute: async () => ({ commandId: 'unused', cursor: '0', replayed: false }),
          events: async () => [],
        },
      }),
      browserBaseUrl: 'http://127.0.0.1:4111',
      authorize: () => ({ actorAgentId: 'cas-existing-l3', scopes: ['control:delegate'] }),
    });
    this.client = new Client({ name: 'cas-existing-l3', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await this.server.connect(serverTransport);
    await this.client.connect(clientTransport);
  },
);

When(
  'the control thread adopts and continues that thread',
  async function (this: World) {
    this.result = await this.client?.callTool({
      name: 'delegate_agent',
      arguments: {
        idempotencyKey: 'adopt-existing-1',
        assignmentRef: 'CAS-EXISTING-THREAD-HANDOFF-R1',
        assignmentDigest: `sha256:${'d'.repeat(64)}`,
        hostId: 'host-local-1',
        repositoryId: 'repository-1',
        baseRevision: 'a'.repeat(40),
        assignmentId: 'assignment-adopted-1',
        completionBoundary: 'ready-for-audit',
        prompt: 'Inspect the existing work without changing its settings.',
        existingThread: {
          threadId: adoptedThreadId,
          activeTurn: { behavior: 'reject' },
        },
      },
    });
    this.continuation = await this.client?.callTool({
      name: 'continue_agent',
      arguments: {
        delegationId: 'delegation-adopted-1',
        prompt: 'Report the result on the same thread.',
        expectedTurnId: 'turn-adopted-1',
      },
    });
  },
);

Then(
  'both prompts target the same thread and one stable viewer route is returned',
  function (this: World) {
    assert.equal(this.calls?.length, 2);
    assert.deepEqual(this.calls?.[0], {
      idempotencyKey: 'adopt-existing-1',
      assignmentRef: 'CAS-EXISTING-THREAD-HANDOFF-R1',
      assignmentDigest: `sha256:${'d'.repeat(64)}`,
      hostId: 'host-local-1',
      workspace: {
        repositoryId: 'repository-1',
        baseRevision: 'a'.repeat(40),
        assignmentId: 'assignment-adopted-1',
      },
      completionBoundary: 'ready-for-audit',
      prompt: 'Inspect the existing work without changing its settings.',
      existingThread: {
        threadId: adoptedThreadId,
        activeTurn: { behavior: 'reject' },
      },
    });
    assert.deepEqual(this.calls?.[1], {
      delegationId: 'delegation-adopted-1',
      prompt: 'Report the result on the same thread.',
      expectedTurnId: 'turn-adopted-1',
    });
    assert.equal(
      (this.result as { structuredContent?: { presentation?: { browserUrl?: string } } })
        ?.structuredContent?.presentation?.browserUrl,
      'http://127.0.0.1:4111/agents/delegation-adopted-1',
    );
    assert.equal(
      (this.continuation as { structuredContent?: { presentation?: { browserUrl?: string } } })
        ?.structuredContent?.presentation?.browserUrl,
      'http://127.0.0.1:4111/agents/delegation-adopted-1',
    );
  },
);

When(
  'the control thread requests one control snapshot',
  async function (this: World) {
    try {
      this.result = await this.client?.callTool({
        name: 'get_control_snapshot',
        arguments: {},
      });
    } catch (error) {
      this.error = error;
    }
  },
);

Then('one compact cursor result is returned', function (this: World) {
  assert.equal(this.error, undefined);
  assert.ok(this.result);
});

After(async function (this: World) {
  await this.client?.close();
  await this.server?.close();
});

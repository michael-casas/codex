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
};

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

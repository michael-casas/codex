import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createCodexControlServer,
  type CodexControlPlane,
} from '../codex-control.gateway.js';

// === L2: REAL-BOUNDARY INTEGRATION TESTS ===
describe('[L2:INTEGRATION] codex-control MCP behavior', () => {
  const close: Array<() => Promise<void>> = [];
  afterEach(async () => {
    for (const stop of close.splice(0).reverse()) await stop();
  });

  async function connected(
    options: {
      authorize?: () => { actorAgentId: string; scopes: string[] };
      delegate?: CodexControlPlane['delegateAgent'];
      continue?: (command: unknown, authorization: { actorAgentId: string; scopes: readonly string[] }) => Promise<unknown>;
      message?: CodexControlPlane['sendAgentMessage'];
      wait?: CodexControlPlane['wait'];
    } = {},
  ) {
    const control = {
      delegateAgent: options.delegate ?? (async () => ({})),
      continueAgent: options.continue ?? (async () => ({})),
      sendAgentMessage: options.message ?? (async () => ({})),
      runWorkflow: async () => ({}),
      cancelAgent: async () => ({}),
      cancelWorkflow: async () => ({}),
      snapshot: async () => ({ cursor: '0', changed: false }),
      wait: options.wait ?? (async () => ({ cursor: '0', changed: false })),
    } as CodexControlPlane;
    const server = createCodexControlServer({
      control,
      authorize:
        options.authorize ??
        (() => ({
          actorAgentId: 'agent-a',
          scopes: [
            'control:delegate',
            'control:message',
            'control:workflow',
            'control:cancel',
            'control:read',
          ],
        })),
    });
    const client = new Client({ name: 'cas-09-adversarial', version: '1.0.0' });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    close.push(
      () => client.close(),
      () => server.close(),
    );
    return client;
  }

  const delegation = {
    idempotencyKey: 'delegate-1',
    assignmentRef: 'CAS-09',
    assignmentDigest: `sha256:${'a'.repeat(64)}`,
    hostId: 'local',
    repositoryId: 'codex',
    baseRevision: 'b'.repeat(40),
    assignmentId: 'CAS-09',
    model: 'gpt-5.6-sol',
    reasoningEffort: 'medium',
    sandbox: 'workspaceWrite',
    approvalPolicy: 'never',
    completionBoundary: 'ready-for-audit',
    prompt: 'Execute the assignment.',
  };

  it('maps one delegate call to one owned operation and returns a compact handle', async () => {
    const delegate = vi.fn(async () => ({
      delegationId: 'd',
      executionId: 'e',
      agentId: 'a',
      hostId: 'local',
      threadId: 't',
    }));
    const client = await connected({ delegate });
    const response = await client.callTool({
      name: 'delegate_agent',
      arguments: delegation,
    });
    expect(delegate).toHaveBeenCalledTimes(1);
    expect(response.structuredContent).toEqual({
      delegationId: 'd',
      executionId: 'e',
      agentId: 'a',
      hostId: 'local',
      threadId: 't',
    });
  });

  it('CAS-ETH-L1-004 advertises one-call adoption and continuation with a stable viewer handle', async () => {
    const delegate = vi.fn(async () => ({
      delegationId: 'adopted-delegation', executionId: 'adopted-execution', agentId: 'adopted-agent', hostId: 'local', threadId: 'thread-existing', ownership: 'adopted',
    }));
    const continued = vi.fn(async () => ({ delegationId: 'adopted-delegation', executionId: 'adopted-execution', agentId: 'adopted-agent', hostId: 'local', threadId: 'thread-existing', ownership: 'adopted' }));
    const client = await connected({ delegate, continue: continued });
    const advertised = (await client.listTools()).tools;
    expect(advertised.find(({ name }) => name === 'delegate_agent')?.inputSchema.properties).toHaveProperty('existingThread');
    expect(advertised.find(({ name }) => name === 'continue_agent')).toBeDefined();
    const { model: _model, reasoningEffort: _effort, sandbox: _sandbox, approvalPolicy: _approval, ...base } = delegation;
    const response = await client.callTool({
      name: 'delegate_agent',
      arguments: {
        ...base,
        existingThread: { threadId: 'thread-existing', activeTurn: { behavior: 'reject' } },
      },
    });
    expect(response.isError, JSON.stringify(response.content)).not.toBe(true);
    expect(delegate).toHaveBeenCalledWith(expect.objectContaining({
      hostId: 'local',
      existingThread: { threadId: 'thread-existing', activeTurn: { behavior: 'reject' } },
    }), expect.anything());
    const followUp = await client.callTool({
      name: 'continue_agent',
      arguments: { delegationId: 'adopted-delegation', prompt: 'One more change.', expectedTurnId: 'turn-current' },
    });
    expect(followUp.isError, JSON.stringify(followUp.content)).not.toBe(true);
    expect(continued).toHaveBeenCalledWith({ delegationId: 'adopted-delegation', prompt: 'One more change.', expectedTurnId: 'turn-current' }, expect.anything());
  });

  it('rejects unknown fields and missing destructive confirmation without a write', async () => {
    const delegate = vi.fn(async () => ({}));
    const client = await connected({ delegate });
    const unknown = await client.callTool({
      name: 'delegate_agent',
      arguments: { ...delegation, providerMethod: 'thread/start' },
    });
    const unconfirmed = await client.callTool({
      name: 'cancel_agent',
      arguments: { delegationId: 'd' },
    });
    expect(unknown.isError).toBe(true);
    expect(unconfirmed.isError).toBe(true);
    expect(delegate).not.toHaveBeenCalled();
  });

  it('denies missing scope and redacts sensitive result keys', async () => {
    const denied = vi.fn(async () => ({ messageId: 'm' }));
    const deniedClient = await connected({
      authorize: () => ({ actorAgentId: 'agent-a', scopes: [] }),
      message: denied,
    });
    const deniedResult = await deniedClient.callTool({
      name: 'send_agent_message',
      arguments: {
        idempotencyKey: 'message-1',
        fromAgentId: 'agent-a',
        toAgentId: 'agent-b',
        body: 'hello',
      },
    });
    expect(deniedResult.isError).toBe(true);
    expect(denied).not.toHaveBeenCalled();

    const allowedClient = await connected({
      message: async () => ({
        messageId: 'm',
        state: 'queued',
        token: 'secret',
        body: '😀'.repeat(5_000),
      }),
    });
    const allowed = await allowedClient.callTool({
      name: 'send_agent_message',
      arguments: {
        idempotencyKey: 'message-2',
        fromAgentId: 'agent-a',
        toAgentId: 'agent-b',
        body: 'hello',
      },
    });
    const structured = allowed.structuredContent as Record<string, unknown>;
    const content = allowed.content as Array<{ type: string; text?: string }>;
    expect(structured).not.toHaveProperty('token');
    expect(Buffer.byteLength(String(structured.body))).toBeLessThanOrEqual(
      4_096,
    );
    expect(
      Buffer.byteLength(
        content[0]?.type === 'text' ? (content[0].text ?? '') : '',
      ),
    ).toBeLessThanOrEqual(8_192);
  });

  it('advertises truthful read-only and destructive annotations', async () => {
    const client = await connected();
    const tools = await client.listTools();
    expect(
      tools.tools.find(({ name }) => name === 'get_control_snapshot')
        ?.annotations,
    ).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(
      tools.tools.find(({ name }) => name === 'cancel_workflow')?.annotations,
    ).toMatchObject({ readOnlyHint: false, destructiveHint: true });
  });

  it('propagates client cancellation to a pending wait and releases it', async () => {
    let aborted = false;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const client = await connected({
      wait: (_query, _authorization, signal) =>
        new Promise((_resolve, reject) => {
          entered();
          signal.addEventListener(
            'abort',
            () => {
              aborted = true;
              reject(new Error('cancelled'));
            },
            { once: true },
          );
        }),
    });
    const controller = new AbortController();
    const pending = client.callTool(
      {
        name: 'wait_control_delta',
        arguments: { afterCursor: '0', waitMs: 30_000 },
      },
      undefined,
      { signal: controller.signal },
    );
    await started;
    controller.abort();
    await expect(pending).rejects.toThrow();
    await vi.waitFor(() => expect(aborted).toBe(true));
  });
});

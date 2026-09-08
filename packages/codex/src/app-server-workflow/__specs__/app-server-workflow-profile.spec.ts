import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { connectAppServer } from '../../app-server-client/index.js';
import type { AppServerJson } from '../../app-server-client/app-server-client.types.js';
import { createAppServerWorkflowExecutor } from '../app-server-workflow.executor.js';

// === L2: REAL-BOUNDARY INTEGRATION TESTS ===
describe('[L2:INTEGRATION] CAS-RP-01 controlled stdio profile wire', () => {
  it('RP-WIRE forwards exact mixed profiles, rejects malformed input, and preserves provider rejection without fallback', async () => {
    const script = fileURLToPath(
      new URL('../support/profile-app-server.fixture.mjs', import.meta.url),
    );
    const client = await connectAppServer({
      command: process.execPath,
      versionArgs: [script, '--version'],
      serverArgs: [script],
      expectedVersion: '0.151.0',
      clientInfo: { name: 'profile-wire', title: 'Profile wire', version: '1' },
      requestTimeoutMs: 2000,
      closeTimeoutMs: 1000,
    });
    const executor = createAppServerWorkflowExecutor({
      connection: {
        async request<T>(method: string, params?: AppServerJson) {
          return (await client.request(method, params)) as T;
        },
        messages: client.messages.bind(client),
        respond: client.respond.bind(client),
        async reconnect() {
          throw new Error('Unexpected reconnect');
        },
      },
      cwd: process.cwd(),
      tempDirectory: `${process.cwd()}/.codex-workspace-tmp`,
      sandbox: 'readOnly',
      approvalPolicy: 'never',
    });
    const request = (
      model: string,
      reasoning: string,
      networkAccess?: boolean,
    ) => ({
      node: {
        id: 'profile-wire',
        model,
        reasoning,
        ...(networkAccess === undefined ? {} : { networkAccess }),
      },
      model,
      reasoning,
      prompt: 'Inspect only',
      signal: new AbortController().signal,
      onRuntimeEvent() {
        return undefined;
      },
    });
    try {
      for (const [model, effort, networkAccess] of [
        ['gpt-5.6-luna', 'high', undefined],
        ['gpt-5.6-sol', 'medium', false],
        ['o3', 'xhigh', true],
      ] as const) {
        const response = await executor.executeAgent(
          request(model, effort, networkAccess),
        );
        expect(JSON.parse(response.finalResponse)).toEqual({
          model,
          effort,
          networkAccess: networkAccess ?? true,
          sandboxType: 'readOnly',
        });
      }
      await expect(
        executor.executeAgent(request('gpt-5.6-luna', 'bad effort') as never),
      ).rejects.toMatchObject({ code: 'WORKFLOW_DEFINITION_INVALID' });
      await expect(
        executor.executeAgent(request('gpt-5.6-luna', 'unsupported') as never),
      ).rejects.toMatchObject({ code: 'REQUEST_FAILED', providerCode: -32602 });
      const calls = await client.request<
        Array<{
          method: string;
          params: {
            effort?: string;
            sandboxPolicy?: { networkAccess?: boolean; type?: string };
          };
        }>
      >('test/calls', {});
      expect(
        calls
          .filter(({ method }) => method === 'turn/start')
          .map(({ params }) => params.effort),
      ).toEqual(['high', 'medium', 'xhigh', 'unsupported']);
      expect(
        calls
          .filter(({ method }) => method === 'turn/start')
          .map(({ params }) => params.sandboxPolicy),
      ).toEqual([
        { type: 'readOnly', networkAccess: true },
        { type: 'readOnly', networkAccess: false },
        { type: 'readOnly', networkAccess: true },
        { type: 'readOnly', networkAccess: true },
      ]);
    } finally {
      await executor.close();
      await client.close();
    }
    expect(client.metrics()).toMatchObject({
      closed: true,
      childExited: true,
      pendingRequests: 0,
    });
  });
});

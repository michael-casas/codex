import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createServer, type Server } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

describe('[L2:E2E] canonical packaged Codex Control runtime', () => {
  let client: Client | undefined;
  let transport: StdioClientTransport | undefined;
  let server: Server | undefined;
  let temporaryDirectory: string | undefined;

  afterEach(async () => {
    await client?.close();
    await transport?.close();
    await new Promise<void>(
      (resolve, reject) =>
        server?.close((error) => (error ? reject(error) : resolve())) ??
        resolve(),
    );
    if (temporaryDirectory)
      await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it('lists tools without credentials and fails invocation closed', async () => {
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] =>
          entry[1] !== undefined && !entry[0].startsWith('CODEX_CONTROL_'),
      ),
    );
    transport = new StdioClientTransport({
      command: process.execPath,
      args: ['plugins/codex-control/dist/server.mjs'],
      cwd: process.cwd(),
      stderr: 'pipe',
      env,
    });
    client = new Client({ name: 'cas-11-r2-discovery', version: '1.0.0' });
    await client.connect(transport);

    expect((await client.listTools()).tools).toHaveLength(9);
    expect(
      await client.callTool({
        name: 'get_control_snapshot',
        arguments: {},
      }),
    ).toMatchObject({
      isError: true,
      content: [{ text: expect.stringContaining('CONTROL_NOT_CONFIGURED') }],
    });
  });

  it('authenticates to the accepted loopback runtime and returns browserUrl', async () => {
    const token = 'c'.repeat(64);
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'cas-11-r2-runtime-'));
    const tokenFile = join(temporaryDirectory, 'token');
    await writeFile(tokenFile, token, { mode: 0o600 });
    server = createServer((request, response) => {
      if (
        request.url !== '/api/control/delegateAgent' ||
        request.headers.authorization !== `Bearer ${token}`
      ) {
        response.writeHead(401).end();
        return;
      }
      request.resume();
      request.on('end', () => {
        response.writeHead(200, { 'content-type': 'application/json' }).end(
          JSON.stringify({
            delegationId: 'delegation-plugin',
            executionId: 'execution-plugin',
            agentId: 'agent-plugin',
            hostId: 'local',
            threadId: 'thread-plugin',
          }),
        );
      });
    });
    await new Promise<void>((resolve, reject) => {
      server?.once('error', reject);
      server?.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('NO_ADDRESS');
    const origin = `http://127.0.0.1:${address.port}`;
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    );
    transport = new StdioClientTransport({
      command: process.execPath,
      args: ['plugins/codex-control/dist/server.mjs'],
      cwd: process.cwd(),
      stderr: 'pipe',
      env: {
        ...env,
        CODEX_CONTROL_ORIGIN: origin,
        CODEX_CONTROL_TOKEN_FILE: tokenFile,
        CODEX_CONTROL_ACTOR_AGENT_ID: 'plugin-owner',
      },
    });
    client = new Client({ name: 'cas-11-r2', version: '1.0.0' });
    await client.connect(transport);

    expect((await client.listTools()).tools).toHaveLength(9);
    const delegated = await client.callTool({
      name: 'delegate_agent',
      arguments: {
        idempotencyKey: 'delegate-plugin',
        assignmentRef: 'CAS-11.R2',
        assignmentDigest: `sha256:${'a'.repeat(64)}`,
        hostId: 'local',
        repositoryId: 'codex',
        baseRevision: 'b'.repeat(40),
        assignmentId: 'CAS-11.R2',
        model: 'gpt-5.6-sol',
        reasoningEffort: 'medium',
        sandbox: 'workspaceWrite',
        approvalPolicy: 'never',
        completionBoundary: 'ready-for-audit',
        prompt: 'Execute the assignment.',
      },
    });
    expect(delegated.isError).not.toBe(true);
    expect(delegated.structuredContent).toMatchObject({
      agentId: 'agent-plugin',
      presentation: { browserUrl: `${origin}/agents/agent-plugin` },
    });
  });
});

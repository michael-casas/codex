import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createServer, type Server } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// === L2: END-TO-END TESTS ===
describe('[L2:E2E] codex-control built stdio process', () => {
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

  it('initializes, delegates through the loopback runtime, presents, and shuts down', async () => {
    const token = 'a'.repeat(64);
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'cas-09-r2-stdio-'));
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
            delegationId: 'delegation-stdio',
            executionId: 'execution-stdio',
            agentId: 'agent-stdio',
            hostId: 'local',
            threadId: 'thread-stdio',
          }),
        );
      });
    });
    const activeServer = server;
    await new Promise<void>((resolve, reject) => {
      activeServer.once('error', reject);
      activeServer.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('NO_ADDRESS');
    const origin = `http://127.0.0.1:${address.port}`;
    const inheritedEnvironment = Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    );
    transport = new StdioClientTransport({
      command: process.execPath,
      args: ['apps/codex-control/dist/main.js'],
      cwd: process.cwd(),
      stderr: 'pipe',
      env: {
        ...inheritedEnvironment,
        CODEX_CONTROL_ORIGIN: origin,
        CODEX_CONTROL_TOKEN_FILE: tokenFile,
        CODEX_CONTROL_ACTOR_AGENT_ID: 'agent-owner',
      },
    });
    client = new Client({ name: 'cas-09-stdio', version: '1.0.0' });
    await client.connect(transport);

    expect((await client.listTools()).tools).toHaveLength(10);
    const delegated = await client.callTool({
      name: 'delegate_agent',
      arguments: {
        idempotencyKey: 'delegate-stdio',
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
    expect(delegated.structuredContent).toMatchObject({
      agentId: 'agent-stdio',
      presentation: {
        browserUrl: `${origin}/agents/agent-stdio`,
      },
    });
  });
});

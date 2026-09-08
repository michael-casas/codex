import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  connectAppServer,
  createAppServerWorkflowExecutor,
  type AppServerJson,
} from '@codex/codex';
import { createControlDatabaseFixture } from '@codex/db/testing';
import { PostgresControlStore } from '@codex/db';
import { PgBossDeliveryRuntime } from '@codex/delivery';
import { createDurableWorkflowClient } from '@codex/process';
import {
  createWorkflowSourceSubmission,
  executeWorkflow,
  prepareWorkflowRun,
  type RunWorkflowCommand,
} from '@codex/workflows';
import {
  compileWorkflowSource,
  loadCompiledWorkflowSource,
} from '@codex/workflows/source';
import {
  createDelegationService,
  type DelegationRecord,
  type DelegationRepository,
} from '@codex/process';
import { createCodexControlServer } from '../codex-control.gateway.js';

// === L2: REAL-BOUNDARY INTEGRATION TESTS ===
describe('[L2:INTEGRATION] codex-control MCP protocol', () => {
  const close: Array<() => Promise<void>> = [];
  afterEach(async () => {
    for (const stop of close.splice(0).reverse()) await stop();
  });

  it('WA-L2-REPLAY persists one source submission and executes mixed profiles on real stdio', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cas-wa-wire-'));
    close.push(() => rm(root, { recursive: true, force: true }));
    const database = await createControlDatabaseFixture();
    close.push(() => database.close());
    const delivery = new PgBossDeliveryRuntime(
      database.daemonUrl,
      database.ownerUrl,
    );
    close.push(() => delivery.stop());
    await delivery.start();
    await delivery.ensureQueue('workflow-execution');
    await delivery.ensureQueue('workflow-execution-dead');
    const store = new PostgresControlStore(database.daemonUrl, delivery);
    const durable = createDurableWorkflowClient({
      store,
      prepare: prepareWorkflowRun,
    });
    const submitted: RunWorkflowCommand[] = [];
    const artifactDirectory = join(root, 'modules');
    const submitSource = createWorkflowSourceSubmission({
      async resolveContext(actorAgentId, hostId) {
        if (
          actorAgentId !== 'owner' ||
          (hostId !== undefined && hostId !== 'controlled')
        )
          throw new Error('WORKFLOW_CONTEXT_MISSING');
        return {
          sourceRoot: root,
          artifactDirectory,
          hostId: 'controlled',
          workspace: {
            repositoryId: 'test',
            assignmentId: 'WA',
            baseRevision: 'a'.repeat(40),
          },
          runtimeProfile: {
            model: 'gpt-5.6-luna',
            reasoningEffort: 'high',
            sandbox: 'readOnly',
            approvalPolicy: 'never',
          },
        };
      },
      compileSource: compileWorkflowSource,
      async submit(command) {
        submitted.push(command);
        return durable.runWorkflow(command);
      },
    });
    const forbidden = async () => {
      throw new Error('Unexpected operation');
    };
    const server = createCodexControlServer({
      control: {
        runWorkflow: submitSource,
        delegateAgent: forbidden,
        sendAgentMessage: forbidden,
        cancelAgent: forbidden,
        cancelWorkflow: forbidden,
        snapshot: forbidden,
        wait: forbidden,
      },
      authorize: () => ({
        actorAgentId: 'owner',
        scopes: ['control:workflow'],
      }),
      browserBaseUrl: 'http://127.0.0.1:4765',
    });
    close.push(() => server.close());
    const client = new Client({ name: 'source-wire', version: '1' });
    close.push(() => client.close());
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    await writeFile(
      join(root, 'brief.ts'),
      'export const brief = "First brief";',
    );
    await writeFile(
      join(root, 'demo.workflow.ts'),
      `
      import {defineWorkflow, phase, parallel, agent} from '@codex/workflows';
      import {brief} from './brief.ts';
      export default defineWorkflow({id:'source-wire',run:async()=>{
        const research=await phase('build',()=>parallel([()=>agent({label:'builder',model:'gpt-5.6-luna',reasoning:'high',prompt:brief})]));
        return phase('judge',()=>agent({label:'judge',model:'gpt-5.6-sol',reasoning:'medium',prompt:'Judge',input:research}));
      }});`,
    );
    const command = {
      source: 'demo.workflow.ts',
      input: {},
      idempotencyKey: 'source-wire',
    };
    const first = await client.callTool({
      name: 'run_workflow',
      arguments: command,
    });
    expect(first.isError, JSON.stringify(first.content)).not.toBe(true);
    const replay = await client.callTool({
      name: 'run_workflow',
      arguments: command,
    });
    expect(replay.structuredContent).toEqual(first.structuredContent);
    const admitted = submitted[0];
    if (!admitted) throw new Error('Source not admitted');
    const prepared = prepareWorkflowRun(admitted);
    expect(first.structuredContent).toMatchObject({
      runId: prepared.runId,
      presentation: {
        browserUrl: `http://127.0.0.1:4765/workflows/${prepared.runId}`,
      },
    });
    expect(
      (await store.events(prepared.streamId, '0')).filter(
        (event) => event.kind === 'delivery.requested',
      ),
    ).toHaveLength(1);

    const script = fileURLToPath(
      new URL(
        '../../../../../packages/codex/src/app-server-workflow/support/profile-app-server.fixture.mjs',
        import.meta.url,
      ),
    );
    const connection = await connectAppServer({
      command: process.execPath,
      versionArgs: [script, '--version'],
      serverArgs: [script],
      expectedVersion: '0.151.0',
      clientInfo: { name: 'source-wire', title: 'Source wire', version: '1' },
      requestTimeoutMs: 2000,
      closeTimeoutMs: 1000,
    });
    close.push(() => connection.close());
    const executor = createAppServerWorkflowExecutor({
      connection: {
        async request<T>(method: string, params?: AppServerJson) {
          return (await connection.request(method, params)) as T;
        },
        messages: connection.messages.bind(connection),
        respond: connection.respond.bind(connection),
        async reconnect() {
          throw new Error('Unexpected reconnect');
        },
      },
      cwd: root,
      sandbox: 'readOnly',
      tempDirectory: join(root, '.codex-workspace-tmp'),
      approvalPolicy: 'never',
    });
    close.push(() => executor.close());
    const loaded = await loadCompiledWorkflowSource(
      artifactDirectory,
      admitted.workflowRef,
    );
    const executed = await executeWorkflow(
      loaded.definition,
      {},
      {
        runId: prepared.runId,
        executeAgent: (request) =>
          executor.executeAgent({
            node: request.node,
            model: request.model,
            reasoning: request.reasoning,
            prompt: request.prompt,
            signal: request.signal,
            onRuntimeEvent: request.onRuntimeEvent,
          }),
        async writeArtifact() {
          throw new Error('Unexpected artifact');
        },
        onEvent() {
          return undefined;
        },
      },
    );
    expect(executed.status).toBe('completed');
    const calls = await connection.request<
      Array<{ method: string; params: { model?: string; effort?: string } }>
    >('test/calls', {});
    expect(
      calls
        .filter((call) => call.method === 'turn/start')
        .map((call) => [call.params.model, call.params.effort]),
    ).toEqual([
      ['gpt-5.6-luna', 'high'],
      ['gpt-5.6-sol', 'medium'],
    ]);
    await writeFile(
      join(root, 'brief.ts'),
      'export const brief = "Changed brief";',
    );
    expect(
      (await client.callTool({ name: 'run_workflow', arguments: command }))
        .isError,
    ).toBe(true);
    const distinct = await client.callTool({
      name: 'run_workflow',
      arguments: { ...command, idempotencyKey: 'intentional-second' },
    });
    expect(distinct.isError).not.toBe(true);
    expect(distinct.structuredContent).not.toMatchObject({
      runId: prepared.runId,
    });
  }, 30_000);

  it('WA-L2-MCP accepts one source submission and preserves its retry key without author metadata', async () => {
    const submitted: unknown[] = [];
    const forbidden = async () => {
      throw new Error('Unexpected control operation');
    };
    const server = createCodexControlServer({
      control: {
        delegateAgent: forbidden,
        sendAgentMessage: forbidden,
        cancelAgent: forbidden,
        cancelWorkflow: forbidden,
        snapshot: forbidden,
        wait: forbidden,
        async runWorkflow(command) {
          submitted.push(command);
          return { runId: 'source-run', state: 'accepted' };
        },
      },
      authorize: () => ({
        actorAgentId: 'owner',
        scopes: ['control:workflow'],
      }),
      browserBaseUrl: 'http://127.0.0.1:4765',
    });
    const client = new Client({ name: 'source-submission', version: '1' });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    close.push(
      () => server.close(),
      () => client.close(),
    );
    const advertised = (await client.listTools()).tools.find(
      (tool) => tool.name === 'run_workflow',
    );
    expect(advertised?.inputSchema.properties).toHaveProperty('source');
    expect(advertised?.inputSchema.required).toContain('idempotencyKey');
    const command = {
      source: '.agent/artifacts/demo.workflow.ts',
      input: { count: 4 },
      idempotencyKey: 'one-call',
    };
    const response = await client.callTool({
      name: 'run_workflow',
      arguments: command,
    });
    expect(response.isError, JSON.stringify(response.content)).not.toBe(true);
    expect(response.structuredContent).toMatchObject({
      runId: 'source-run',
      presentation: {
        browserUrl: 'http://127.0.0.1:4765/workflows/source-run',
      },
    });
    expect(submitted).toEqual([command]);
  });

  it('CAS-NET-GC1-006 exposes and preserves explicit direct-handoff network denial', async () => {
    const delegated: unknown[] = [];
    const forbidden = async () => {
      throw new Error('Unexpected control operation');
    };
    const server = createCodexControlServer({
      control: {
        async delegateAgent(command) {
          delegated.push(command);
          return {
            delegationId: 'network-delegation',
            executionId: 'network-execution',
            agentId: 'network-agent',
            hostId: 'local',
            threadId: 'network-thread',
          };
        },
        runWorkflow: forbidden,
        sendAgentMessage: forbidden,
        cancelAgent: forbidden,
        cancelWorkflow: forbidden,
        snapshot: forbidden,
        wait: forbidden,
      },
      authorize: () => ({
        actorAgentId: 'owner',
        scopes: ['control:delegate'],
      }),
    });
    const client = new Client({ name: 'network-delegation', version: '1' });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    close.push(
      () => server.close(),
      () => client.close(),
    );

    const advertised = (await client.listTools()).tools.find(
      (tool) => tool.name === 'delegate_agent',
    );
    expect(advertised?.inputSchema.properties).toMatchObject({
      networkAccess: { type: 'boolean' },
    });
    expect(advertised?.inputSchema.required).not.toContain('networkAccess');
    const argumentsBase = {
      idempotencyKey: 'network-delegation',
      assignmentRef: 'CAS-AGENT-NETWORK-DEFAULT-R1',
      assignmentDigest: `sha256:${'a'.repeat(64)}`,
      hostId: 'local',
      repositoryId: 'codex',
      baseRevision: 'b'.repeat(40),
      assignmentId: 'CAS-AGENT-NETWORK-DEFAULT-R1',
      model: 'gpt-5.6-sol',
      reasoningEffort: 'medium',
      sandbox: 'readOnly',
      approvalPolicy: 'never',
      completionBoundary: 'ready-for-audit',
      prompt: 'Inspect only.',
    };
    const response = await client.callTool({
      name: 'delegate_agent',
      arguments: { ...argumentsBase, networkAccess: false },
    });
    expect(response.isError, JSON.stringify(response.content)).not.toBe(true);
    expect(delegated).toEqual([
      expect.objectContaining({
        runtimeProfile: expect.objectContaining({ networkAccess: false }),
      }),
    ]);
    expect(
      (
        await client.callTool({
          name: 'delegate_agent',
          arguments: { ...argumentsBase, networkAccess: 'false' },
        })
      ).isError,
    ).toBe(true);
    expect(delegated).toHaveLength(1);
  });

  it('RP-WIRE-DELEGATION preserves profile in serialized initial and resumed turns', async () => {
    const child = spawn(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
      import { createInterface } from 'node:readline';
      const calls = [];
      for await (const line of createInterface({ input: process.stdin })) {
        const { id, method, params } = JSON.parse(line);
        calls.push({ method, params });
        const result = method === 'thread/start' ? { thread: { id: 'wire-thread' } }
          : method === 'thread/read' ? { thread: { status: { type: 'idle' }, turns: [] } }
          : method === 'turn/start' ? { turn: { id: 'wire-turn' } }
          : method === 'test/calls' ? calls : {};
        process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\\n');
      }
    `,
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    const exited = new Promise<void>((resolve) =>
      child.once('close', () => resolve()),
    );
    const timeout = setTimeout(() => child.kill('SIGTERM'), 5000);
    const lines = createInterface({ input: child.stdout });
    const messages = lines[Symbol.asyncIterator]();
    let sequence = 0;
    const connection = {
      async request<T>(
        method: string,
        params?: Record<string, unknown>,
      ): Promise<T> {
        const id = ++sequence;
        child.stdin.write(
          JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n',
        );
        const message = await messages.next();
        if (message.done) throw new Error('Child stopped before response');
        const response = JSON.parse(message.value) as { id: number; result: T };
        expect(response.id).toBe(id);
        return response.result;
      },
    };
    let record: DelegationRecord | undefined;
    const required = () => {
      if (!record) throw new Error('Missing delegation');
      return record;
    };
    const repository: DelegationRepository = {
      async reserve(command, fingerprint) {
        record = {
          command,
          fingerprint,
          delegationId: 'wire-delegation',
          executionId: 'wire-execution',
          agentId: 'wire-agent',
          state: 'reserved',
        };
        return { record, replayed: false };
      },
      async bind(_id, binding) {
        record = { ...required(), ...binding };
        return record;
      },
      async read() {
        return record;
      },
      async transition(_id, state, activeTurnId) {
        record = { ...required(), state, activeTurnId };
        return record;
      },
    };
    const service = createDelegationService({
      repository,
      hosts: { connect: async () => connection },
      workspaces: {
        acquire: async () => ({ workspaceRef: 'wire-workspace' }),
        resolve: async () => ({ cwd: process.cwd() }),
        release: async () => undefined,
      },
    });
    try {
      const handle = await service.delegateAgent({
        idempotencyKey: 'wire',
        assignmentRef: 'CAS-RP-01',
        assignmentDigest: `sha256:${'a'.repeat(64)}`,
        hostId: 'local',
        workspace: {
          repositoryId: 'codex',
          baseRevision: 'b'.repeat(40),
          assignmentId: 'CAS-RP-01',
        },
        runtimeProfile: {
          model: 'gpt-5.6-luna',
          reasoningEffort: 'high',
          sandbox: 'readOnly',
          approvalPolicy: 'never',
          networkAccess: false,
        },
        completionBoundary: 'runtime-settled',
        prompt: 'Read only.',
      });
      await service.continueAgent(handle.delegationId, 'Continue read only.');
      const calls =
        await connection.request<Array<{ method: string; params: unknown }>>(
          'test/calls',
        );
      const turns = calls.filter(({ method }) => method === 'turn/start');
      expect(turns).toHaveLength(2);
      for (const turn of turns)
        expect(turn.params).toMatchObject({
          model: 'gpt-5.6-luna',
          effort: 'high',
          sandboxPolicy: { type: 'readOnly', networkAccess: false },
        });
    } finally {
      lines.close();
      child.stdin.end();
      child.kill('SIGTERM');
      await exited;
      clearTimeout(timeout);
    }
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
  });

  it('advertises strict task-level tools over MCP', async () => {
    const server = createCodexControlServer();
    const client = new Client({ name: 'cas-09-test', version: '1.0.0' });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    close.push(
      () => client.close(),
      () => server.close(),
    );
    const listed = await client.listTools();
    expect(listed.tools.map(({ name }) => name)).toContain('delegate_agent');
    expect(listed.tools.map(({ name }) => name)).toContain(
      'get_control_snapshot',
    );
  });
});

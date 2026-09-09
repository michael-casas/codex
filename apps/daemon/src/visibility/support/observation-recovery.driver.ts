import assert from 'node:assert/strict';
import {
  connectAppServer,
  createAppServerWorkflowExecutor,
  type AppServerJson,
} from '@codex/codex';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import {
  PostgresControlStore,
  PostgresRuntimeVisibilityRepository,
} from '@codex/db';
import { createRuntimeVisibilityDatabaseFixture } from '@codex/db/testing';
import {
  createControlHttpServer,
  type CodexControlPlane,
} from '@codex/control-gateway';
import { createRuntimeVisibilityDaemon } from '../runtime-visibility-daemon.js';

export async function observationRecoveryScenario() {
  const database = await createRuntimeVisibilityDatabaseFixture();
  const owner = new Client({ connectionString: database.ownerUrl });
  const repository = new PostgresRuntimeVisibilityRepository(
    database.daemonUrl,
  );
  const store = new PostgresControlStore(database.daemonUrl);
  let observedFault!: () => void;
  const faultSeen = new Promise<void>((resolve) => {
    observedFault = resolve;
  });
  let opened = 0,
    closed = 0;
  const daemon = createRuntimeVisibilityDaemon(repository, {
    sourcePage: (after) => repository.sourcePage(after),
    async listenSource(notify, onError) {
      const stop = await repository.listenSource(notify, (error) => {
        onError(error);
        observedFault();
      });
      opened++;
      return async () => {
        await stop();
        closed++;
      };
    },
  });
  const unsupported = async () => {
    throw Error('UNEXPECTED_MUTATION');
  };
  const http = createControlHttpServer({
    control: {
      delegateAgent: unsupported,
      sendAgentMessage: unsupported,
      runWorkflow: unsupported,
      cancelAgent: unsupported,
      cancelWorkflow: unsupported,
      snapshot: (q) => daemon.snapshot(q),
      wait: (q, _a, s) => daemon.wait(q, s),
    },
    token: 'x'.repeat(32),
    uiDirectory: process.cwd(),
    port: 0,
  });
  const runId = `workflow_${'b'.repeat(64)}`;
  const append = async (kind: string) =>
    store.execute({
      commandId: randomUUID(),
      idempotencyKey: randomUUID(),
      streamId: `workflow:${runId}`,
      kind,
      payload: { runId },
      events: [{ eventId: randomUUID(), kind, payload: { runId } }],
    });
  await owner.connect();
  try {
    for (const file of [
      '003_agent_messaging.sql',
      '004_agent_delegation.sql',
      '006_visibility_source_reads.sql',
    ])
      await owner.query(
        await readFile(resolve('migrations/process', file), 'utf8'),
      );
    await append('workflow.started');
    await daemon.start();
    const { origin } = await http.start();
    await owner.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=current_database() AND query='LISTEN process_control_event' AND pid<>pg_backend_pid()",
    );
    await faultSeen;
    const degraded = await fetch(`${origin}/api/control/snapshot`);
    const degradedBody = (await degraded.json()) as { code?: string };
    await append('workflow.failed');
    const before = await store.events(`workflow:${runId}`, '0');
    let terminal = false;
    const deadline = Date.now() + 4500;
    while (Date.now() < deadline) {
      const response = await fetch(`${origin}/api/control/snapshot`);
      const body = (await response.json()) as {
        workflows?: Array<{ status: string }>;
      };
      if (response.ok && body.workflows?.[0]?.status === 'failed') {
        terminal = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    const after = await store.events(`workflow:${runId}`, '0');
    const source = await repository.sourcePage('0');
    await daemon.stop();
    await daemon.start();
    const replay = await daemon.snapshot();
    const count = await database.eventCount();
    return {
      degradedStatus: degraded.status,
      degradedCode: degradedBody.code,
      terminal,
      historyPreserved:
        JSON.stringify(before, (_k, v) =>
          typeof v === 'bigint' ? String(v) : v,
        ) ===
        JSON.stringify(after, (_k, v) =>
          typeof v === 'bigint' ? String(v) : v,
        ),
      replayTerminal: replay.workflows?.[0]?.status === 'failed',
      eventCount: count,
      sourceCount: source.length,
    };
  } finally {
    const stopped = await Promise.allSettled([
      http.stop(),
      daemon.stop(),
      owner.end(),
    ]);
    await database.close();
    const inspect = new Client({
      connectionString: process.env['POSTGRES_URL'],
    });
    await inspect.connect();
    try {
      const databases = await inspect.query(
        'SELECT count(*)::int AS count FROM pg_database WHERE datname=$1',
        [database.databaseName],
      );
      const roles = await inspect.query(
        'SELECT count(*)::int AS count FROM pg_roles WHERE rolname=ANY($1::text[])',
        [
          [
            new URL(database.daemonUrl).username,
            new URL(database.readerUrl).username,
          ],
        ],
      );
      assert.equal(databases.rows[0].count, 0, 'OBSERVER_DATABASE_LEAK');
      assert.equal(roles.rows[0].count, 0, 'OBSERVER_ROLE_LEAK');
      assert.equal(closed, opened, 'OBSERVER_LISTENER_LEAK');
      assert.ok(
        stopped.every((result) => result.status === 'fulfilled'),
        'OBSERVER_SHUTDOWN_FAILED',
      );
    } finally {
      await inspect.end();
    }
  }
}

export async function serializationScenario() {
  const http = createControlHttpServer({
    control: {
      snapshot: async () => ({ cursor: 1n }),
      wait: async () => {
        throw Object.assign(Error('private'), {
          code: 'secret /Users/private token=value',
        });
      },
    } as unknown as CodexControlPlane,
    token: 'x'.repeat(32),
    uiDirectory: process.cwd(),
    port: 0,
  });
  try {
    const { origin } = await http.start();
    const read = async (path: string) => {
      try {
        const response = await fetch(origin + path);
        return { status: response.status, body: await response.json() };
      } catch {
        return { status: 0, body: 'invalid response' };
      }
    };
    return {
      snapshot: await read('/api/control/snapshot'),
      wait: await read('/api/control/wait?afterCursor=0&waitMs=0'),
    };
  } finally {
    await http.stop();
  }
}

export async function interruptedBindingScenario() {
  const script = resolve(
    'apps/daemon/src/visibility/support/interrupted-app-server.fixture.mjs',
  );
  const client = await connectAppServer({
    command: process.execPath,
    versionArgs: [script, '--version'],
    serverArgs: [script],
    expectedVersion: '0.151.0',
    clientInfo: {
      name: 'observation-fixture',
      title: 'Observation fixture',
      version: '1',
    },
    requestTimeoutMs: 2000,
    closeTimeoutMs: 1000,
  });
  const executor = createAppServerWorkflowExecutor({
    connection: {
      request: async <T>(method: string, params?: AppServerJson) =>
        (await client.request(method, params)) as T,
      messages: client.messages.bind(client),
      respond: client.respond.bind(client),
      reconnect: async () => {
        throw Error('UNEXPECTED_RECONNECT');
      },
    },
    cwd: process.cwd(),
    tempDirectory: resolve('.codex-workspace-tmp'),
    sandbox: 'readOnly',
    approvalPolicy: 'never',
  });
  let code: unknown, retryable: unknown, ambiguous: unknown;
  let calls: string[] = [];
  try {
    try {
      await executor.reconcileAgent(
        {
          node: { id: 'node-fixture', model: 'gpt-5.6-luna', reasoning: 'low' },
          model: 'gpt-5.6-luna',
          reasoning: 'low',
          prompt: 'synthetic',
          signal: new AbortController().signal,
          onRuntimeEvent: () => undefined,
        },
        {
          nodeId: 'node-fixture',
          threadId: 'thread-fixture',
          turnId: 'turn-fixture',
        },
      );
    } catch (error) {
      ({ code, retryable, ambiguous } = error as {
        code?: string;
        retryable?: boolean;
        ambiguous?: boolean;
      });
    }
    calls = await client.request<string[]>('test/calls', {});
  } finally {
    await executor.close();
    await client.close();
  }
  return {
    code,
    retryable,
    ambiguous,
    starts: calls.filter((m) => m === 'thread/start' || m === 'turn/start')
      .length,
    reads: calls.filter((m) => m === 'thread/read').length,
    childExited: client.metrics().childExited,
    pendingRequests: client.metrics().pendingRequests,
  };
}
